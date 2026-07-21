// Migra os arquivos que já existem no Vercel Blob pro Cloudflare R2,
// mantendo a mesma organização de pastas/nomes, e atualiza no banco o
// campo de cada pedido que apontava pro Blob pra apontar pra chave nova
// no R2. Uso: node scripts/migrar-blob-para-r2.mjs
import { PrismaClient } from "@prisma/client";
import { list } from "@vercel/blob";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";
import os from "os";

for (const linha of fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = linha.match(/^([A-Z0-9_]+)="?([^"]*)"?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const prisma = new PrismaClient();
const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});
const BUCKET = process.env.R2_BUCKET_NAME;

async function listarTodosDoBlob() {
  const arquivos = [];
  let cursor;
  do {
    const r = await list({ cursor, limit: 1000 });
    arquivos.push(...r.blobs);
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return arquivos;
}

const arquivosBlob = await listarTodosDoBlob();
console.log(`Encontrados ${arquivosBlob.length} arquivo(s) no Vercel Blob.\n`);

const pedidos = await prisma.pedido.findMany({
  select: { id: true, canhotoUrl: true, comprovantePagamentoUrl: true },
});

const relatorio = { total: arquivosBlob.length, migrados: 0, semPedidoAssociado: 0, falhas: [] };

for (const arquivo of arquivosBlob) {
  try {
    const resp = await fetch(arquivo.url);
    if (!resp.ok) throw new Error(`download falhou (status ${resp.status})`);
    const bytes = Buffer.from(await resp.arrayBuffer());

    await r2.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: arquivo.pathname,
        Body: bytes,
        ContentType: resp.headers.get("content-type") || "application/octet-stream",
      })
    );

    // Atualiza qualquer pedido cujo canhoto/comprovante apontava pra essa URL do Blob.
    const pedidoCanhoto = pedidos.find((p) => p.canhotoUrl === arquivo.url);
    const pedidoComprovante = pedidos.find((p) => p.comprovantePagamentoUrl === arquivo.url);

    if (pedidoCanhoto) {
      await prisma.pedido.update({ where: { id: pedidoCanhoto.id }, data: { canhotoUrl: arquivo.pathname } });
    }
    if (pedidoComprovante) {
      await prisma.pedido.update({ where: { id: pedidoComprovante.id }, data: { comprovantePagamentoUrl: arquivo.pathname } });
    }
    if (!pedidoCanhoto && !pedidoComprovante) {
      relatorio.semPedidoAssociado++;
    }

    relatorio.migrados++;
    console.log(`OK  ${arquivo.pathname} (${(arquivo.size / 1024).toFixed(1)} KB)${pedidoCanhoto ? ` -> pedido #${pedidoCanhoto.id} (canhoto)` : ""}${pedidoComprovante ? ` -> pedido #${pedidoComprovante.id} (comprovante)` : ""}`);
  } catch (err) {
    relatorio.falhas.push({ pathname: arquivo.pathname, erro: err.message });
    console.log(`FALHOU  ${arquivo.pathname}: ${err.message}`);
  }
}

console.log("\n=== Relatório final ===");
console.log(`Total de arquivos no Vercel Blob: ${relatorio.total}`);
console.log(`Migrados com sucesso: ${relatorio.migrados}`);
console.log(`Sem pedido associado (arquivo órfão, migrado mas nenhum registro atualizado): ${relatorio.semPedidoAssociado}`);
console.log(`Falhas: ${relatorio.falhas.length}`);
if (relatorio.falhas.length > 0) {
  console.log(JSON.stringify(relatorio.falhas, null, 2));
}

const nomeRelatorio = `stier-migracao-r2-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;
const caminhoRelatorio = path.join(os.homedir(), "Downloads", nomeRelatorio);
fs.writeFileSync(caminhoRelatorio, JSON.stringify(relatorio, null, 2));
console.log(`\nRelatório salvo em: ${caminhoRelatorio}`);

await prisma.$disconnect();

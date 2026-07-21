import { NextRequest, NextResponse } from "next/server";
import { list } from "@vercel/blob";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { podeExcluirMes } from "@/lib/auth";

// Rota TEMPORÁRIA, usada uma única vez pra migrar os arquivos que já
// existiam no Vercel Blob pro Cloudflare R2 (rodando dentro da infra do
// Vercel, sem a inspeção HTTPS do antivírus local no meio, que bloqueava
// isso ao rodar do computador). Remover depois de confirmado que funcionou.
export async function POST(req: NextRequest) {
  const papel = (req.headers.get("x-user-papel") ?? "TRANSPORTADOR") as
    | "MASTER"
    | "ADMIN"
    | "ANALISTA"
    | "TRANSPORTADOR";
  if (!podeExcluirMes(papel)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const r2 = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  const BUCKET = process.env.R2_BUCKET_NAME!;

  const arquivosBlob: { url: string; pathname: string; size: number }[] = [];
  let cursor: string | undefined;
  do {
    const r = await list({ cursor, limit: 1000 });
    arquivosBlob.push(...r.blobs);
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);

  const pedidos = await prisma.pedido.findMany({
    select: { id: true, canhotoUrl: true, comprovantePagamentoUrl: true },
  });

  const relatorio = {
    total: arquivosBlob.length,
    migrados: 0,
    semPedidoAssociado: 0,
    falhas: [] as { pathname: string; erro: string }[],
    detalhes: [] as string[],
  };

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

      const pedidoCanhoto = pedidos.find((p) => p.canhotoUrl === arquivo.url);
      const pedidoComprovante = pedidos.find((p) => p.comprovantePagamentoUrl === arquivo.url);

      if (pedidoCanhoto) {
        await prisma.pedido.update({ where: { id: pedidoCanhoto.id }, data: { canhotoUrl: arquivo.pathname } });
      }
      if (pedidoComprovante) {
        await prisma.pedido.update({ where: { id: pedidoComprovante.id }, data: { comprovantePagamentoUrl: arquivo.pathname } });
      }
      if (!pedidoCanhoto && !pedidoComprovante) relatorio.semPedidoAssociado++;

      relatorio.migrados++;
      relatorio.detalhes.push(
        `OK ${arquivo.pathname}${pedidoCanhoto ? ` -> pedido #${pedidoCanhoto.id} (canhoto)` : ""}${pedidoComprovante ? ` -> pedido #${pedidoComprovante.id} (comprovante)` : ""}`
      );
    } catch (err) {
      relatorio.falhas.push({ pathname: arquivo.pathname, erro: (err as Error).message });
    }
  }

  return NextResponse.json(relatorio);
}

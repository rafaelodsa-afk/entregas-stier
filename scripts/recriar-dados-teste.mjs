// Apaga todos os pedidos atuais (+ arquivos no R2 associados) e cria 60
// pedidos de teste novos, 10 por grupo de transportador — pensado pra
// popular o ambiente de teste com uma base conhecida e variada. Uso:
// node scripts/recriar-dados-teste.mjs
import { PrismaClient } from "@prisma/client";
import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import fs from "fs";

for (const linha of fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = linha.match(/^([A-Z0-9_]+)="?([^"]*)"?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
for (const linha of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
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

const CIDADES = [
  ["Porto Alegre", "Centro"], ["Novo Hamburgo", "Hamburgo Velho"], ["Canoas", "Niterói"],
  ["Gramado", "Planalto"], ["Caxias do Sul", "Exposição"], ["Bento Gonçalves", "Centro"],
  ["Taquara", "Bela Vista"], ["Igrejinha", "Centro"], ["Rolante", "Centro"],
  ["Três Coroas", "Alpes Verdes"], ["São Leopoldo", "Rio Branco"], ["Farroupilha", "Centro"],
];
const NOMES_NEGOCIO = [
  "Mercado", "Distribuidora", "Atacado", "Armazém", "Padaria", "Comercial", "Mercearia", "Empório", "Depósito", "Loja",
];
const RUAS = ["Rua das Flores", "Av. Brasil", "Rua Marechal Floriano", "Av. Osvaldo Aranha", "Rua Sete de Setembro", "Rua XV de Novembro"];

function gerarEndereco(indiceGlobal) {
  const [cidade, bairro] = CIDADES[indiceGlobal % CIDADES.length];
  const negocio = NOMES_NEGOCIO[indiceGlobal % NOMES_NEGOCIO.length];
  const rua = RUAS[indiceGlobal % RUAS.length];
  const numero = String(100 + (indiceGlobal * 37) % 900);
  return {
    cliente: `${negocio} ${bairro} ${cidade}`.trim(),
    cidade,
    bairro,
    rua,
    numero,
  };
}

const GRUPOS = ["Contém", "Rumax", "Brothers", "Bordilog", "Frota Própria – Jonathan", "Frota Própria – Murilo"];

// Dentro de cada grupo de 10: 4 Venda+Dinheiro/Pix, 4 Venda+Boleto, 2 não-Venda+Dinheiro/Pix.
function montarMixDoGrupo() {
  return [
    { operacao: "VENDA", formaPagamento: "PIX" },
    { operacao: "VENDA", formaPagamento: "DINHEIRO" },
    { operacao: "VENDA", formaPagamento: "PIX" },
    { operacao: "VENDA", formaPagamento: "DINHEIRO" },
    { operacao: "VENDA", formaPagamento: "BOLETO" },
    { operacao: "VENDA", formaPagamento: "BOLETO" },
    { operacao: "VENDA", formaPagamento: "BOLETO" },
    { operacao: "VENDA", formaPagamento: "BOLETO" },
    { operacao: "BONIFICACAO", formaPagamento: "PIX" },
    { operacao: "BONIFICACAO", formaPagamento: "DINHEIRO" },
  ];
}

async function main() {
  // 1. Coleta e apaga arquivos do R2 associados aos pedidos atuais.
  const pedidosAtuais = await prisma.pedido.findMany({ select: { canhotoUrl: true, comprovantePagamentoUrl: true } });
  const chaves = [];
  for (const p of pedidosAtuais) {
    if (p.canhotoUrl) chaves.push(p.canhotoUrl);
    if (p.comprovantePagamentoUrl) chaves.push(p.comprovantePagamentoUrl);
  }
  if (chaves.length > 0) {
    await r2.send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: chaves.map((Key) => ({ Key })) } }));
    console.log(`Apagados ${chaves.length} arquivo(s) do R2.`);
  }

  // 2. Apaga todos os pedidos (histórico cascade).
  const apagados = await prisma.pedido.deleteMany({});
  console.log(`Apagados ${apagados.count} pedido(s) do banco.`);

  // 3. Cria os 60 novos.
  let idAtual = 200001;
  let indiceGlobal = 0;
  const criados = [];
  for (const grupo of GRUPOS) {
    const mix = montarMixDoGrupo();
    for (const { operacao, formaPagamento } of mix) {
      const id = String(idAtual++);
      const endereco = gerarEndereco(indiceGlobal++);
      const valorPedido = 200 + ((idAtual * 53) % 6000);
      await prisma.pedido.create({
        data: {
          id,
          cliente: endereco.cliente,
          cidade: endereco.cidade,
          bairro: endereco.bairro,
          rua: endereco.rua,
          numero: endereco.numero,
          transportador: grupo,
          operacao,
          formaPagamento,
          valorPedido,
          statusEntrega: "AGUARDANDO_ACEITE",
          statusFinanceiro: "NA",
        },
      });
      await prisma.historicoPedido.create({
        data: { pedidoId: id, status: "AGUARDANDO_ACEITE", usuario: "Administrador Stier (dados de teste)" },
      });
      criados.push({ id, transportador: grupo, operacao, formaPagamento, valorPedido });
    }
  }

  console.log(`Criados ${criados.length} pedido(s) novos.`);
  console.log(JSON.stringify(criados, null, 2));
  await prisma.$disconnect();
}

main();

// Gera um backup completo (todas as tabelas) do banco em um arquivo .json.
// Uso: node scripts/gerar-backup.mjs
// Salva em ~/Downloads/stier-backup-banco-<data-hora>.json
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import os from "os";
import path from "path";

const prisma = new PrismaClient();

const agora = new Date();
const carimbo = agora.toISOString().replace(/[:.]/g, "-").slice(0, 19);

const [usuarios, pedidos, historico, cidades, exportacoes, arquivamentos] = await Promise.all([
  prisma.usuario.findMany(),
  prisma.pedido.findMany(),
  prisma.historicoPedido.findMany(),
  prisma.cidadeCoordenada.findMany(),
  prisma.exportacaoMensal.findMany(),
  prisma.arquivamentoLog.findMany(),
]);

const backup = {
  geradoEm: agora.toISOString(),
  origem: "Neon Postgres — stier-controle-entregas",
  tabelas: { Usuario: usuarios, Pedido: pedidos, HistoricoPedido: historico, CidadeCoordenada: cidades, ExportacaoMensal: exportacoes, ArquivamentoLog: arquivamentos },
  contagens: {
    Usuario: usuarios.length,
    Pedido: pedidos.length,
    HistoricoPedido: historico.length,
    CidadeCoordenada: cidades.length,
    ExportacaoMensal: exportacoes.length,
    ArquivamentoLog: arquivamentos.length,
  },
};

const nomeArquivo = `stier-backup-banco-${carimbo}.json`;
const caminho = path.join(os.homedir(), "Downloads", nomeArquivo);
fs.writeFileSync(caminho, JSON.stringify(backup, (chave, valor) => (typeof valor === "bigint" ? valor.toString() : valor), 2));

console.log("Backup gerado em:", caminho);
console.log("Contagens:", JSON.stringify(backup.contagens, null, 2));
console.log("Tamanho:", (fs.statSync(caminho).size / 1024).toFixed(1), "KB");

await prisma.$disconnect();

// Restaura o banco a partir de um arquivo gerado por scripts/gerar-backup.mjs.
// Uso: node scripts/restaurar-backup.mjs "C:\caminho\para\stier-backup-banco-XXXX.json"
//
// Apaga TUDO que existe hoje nas tabelas do app e recoloca exatamente o que
// estava no arquivo de backup, dentro de uma única transação — se qualquer
// parte falhar, nada é alterado (a transação inteira é desfeita sozinha).
import { PrismaClient } from "@prisma/client";
import fs from "fs";

const caminhoBackup = process.argv[2];
if (!caminhoBackup) {
  console.error("Uso: node scripts/restaurar-backup.mjs <caminho-do-arquivo-de-backup.json>");
  process.exit(1);
}

const prisma = new PrismaClient();
const backup = JSON.parse(fs.readFileSync(caminhoBackup, "utf8"));

console.log("Restaurando backup gerado em:", backup.geradoEm);
console.log("Contagens no arquivo:", JSON.stringify(backup.contagens));

// Datas vêm como texto ISO no JSON — Prisma precisa de objetos Date de
// verdade nos campos DateTime, senão a inserção falha ou grava errado.
function comDatas(registro, camposData) {
  const copia = { ...registro };
  for (const campo of camposData) {
    if (copia[campo]) copia[campo] = new Date(copia[campo]);
  }
  return copia;
}

await prisma.$transaction(
  async (tx) => {
    // Apaga na ordem que respeita as dependências (Pedido apaga Historico em cascata).
    await tx.historicoPedido.deleteMany({});
    await tx.arquivamentoLog.deleteMany({});
    await tx.exportacaoMensal.deleteMany({});
    await tx.pedido.deleteMany({});
    await tx.cidadeCoordenada.deleteMany({});
    await tx.usuario.deleteMany({});

    // Recria na ordem inversa (quem não depende de ninguém primeiro).
    if (backup.tabelas.Usuario.length) {
      await tx.usuario.createMany({
        data: backup.tabelas.Usuario.map((u) => comDatas(u, ["criadoEm"])),
      });
    }
    if (backup.tabelas.Pedido.length) {
      await tx.pedido.createMany({
        data: backup.tabelas.Pedido.map((p) =>
          comDatas(p, ["dataPrevistaEntrega", "dataCriacao", "dataEntrega", "acertoConfirmadoEm"])
        ),
      });
    }
    if (backup.tabelas.HistoricoPedido.length) {
      await tx.historicoPedido.createMany({
        data: backup.tabelas.HistoricoPedido.map((h) => comDatas(h, ["data"])),
      });
    }
    if (backup.tabelas.CidadeCoordenada.length) {
      await tx.cidadeCoordenada.createMany({
        data: backup.tabelas.CidadeCoordenada.map((c) => comDatas(c, ["atualizadoEm"])),
      });
    }
    if (backup.tabelas.ExportacaoMensal.length) {
      await tx.exportacaoMensal.createMany({
        data: backup.tabelas.ExportacaoMensal.map((e) => comDatas(e, ["exportadoEm"])),
      });
    }
    if (backup.tabelas.ArquivamentoLog.length) {
      await tx.arquivamentoLog.createMany({
        data: backup.tabelas.ArquivamentoLog.map((a) => comDatas(a, ["excluidoEm"])),
      });
    }
  },
  { timeout: 60000 }
);

console.log("\nRestauração concluída com sucesso.");
const [u, p, h, c, e, a] = await Promise.all([
  prisma.usuario.count(),
  prisma.pedido.count(),
  prisma.historicoPedido.count(),
  prisma.cidadeCoordenada.count(),
  prisma.exportacaoMensal.count(),
  prisma.arquivamentoLog.count(),
]);
console.log("Contagens depois de restaurar:", JSON.stringify({ Usuario: u, Pedido: p, HistoricoPedido: h, CidadeCoordenada: c, ExportacaoMensal: e, ArquivamentoLog: a }));

await prisma.$disconnect();

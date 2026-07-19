import { prisma } from "@/lib/db";

export type LinhaPedido = {
  id?: unknown;
  cliente?: unknown;
  cidade?: unknown;
  bairro?: unknown;
  rua?: unknown;
  numero?: unknown;
  transportador?: unknown;
  formaPagamento?: unknown;
  valorPedido?: unknown;
  prazo?: unknown;
};

// Usado tanto pelo cadastro manual (um pedido por vez) quanto pela
// importação de planilha (várias linhas), para manter a mesma regra de
// negócio nos dois casos.
export async function criarOuReatribuirPedido(linha: LinhaPedido, nomeUsuario: string) {
  const id = String(linha.id ?? "").trim();
  const cliente = String(linha.cliente ?? "").trim();
  const transportador = String(linha.transportador ?? "").trim();
  if (!id || !cliente || !transportador) {
    return { ok: false as const, erro: "Preencha nº do pedido, cliente e transportador" };
  }

  const dados = {
    cliente,
    cidade: String(linha.cidade ?? "").trim(),
    bairro: String(linha.bairro ?? "").trim(),
    rua: String(linha.rua ?? "").trim(),
    numero: String(linha.numero ?? "").trim(),
    transportador,
    formaPagamento: String(linha.formaPagamento ?? "BOLETO").trim().toUpperCase(),
    valorPedido: Number(linha.valorPedido) || 0,
    prazo: String(linha.prazo ?? "").trim(),
  };

  const existente = await prisma.pedido.findUnique({ where: { id } });

  if (!existente) {
    const pedido = await prisma.pedido.create({
      data: { id, ...dados, statusEntrega: "AGUARDANDO_ACEITE", statusFinanceiro: "NA" },
    });
    await prisma.historicoPedido.create({
      data: { pedidoId: id, status: "AGUARDANDO_ACEITE", usuario: nomeUsuario },
    });
    return { ok: true as const, pedido, criado: true };
  }

  // Regra de negócio: só um pedido em reentrega pode ser reatribuído a um novo
  // transportador reimportando o mesmo nº. Entregue/cancelado nunca são reabertos.
  if (existente.statusEntrega !== "REENTREGA") {
    return {
      ok: false as const,
      erro: `Pedido #${id} já existe e não está em reentrega (status atual: ${existente.statusEntrega})`,
    };
  }

  const pedido = await prisma.pedido.update({
    where: { id },
    data: { ...dados, statusEntrega: "AGUARDANDO_ACEITE", statusFinanceiro: "NA", dataEntrega: null, observacaoProblema: null },
  });
  await prisma.historicoPedido.create({
    data: {
      pedidoId: id,
      status: "AGUARDANDO_ACEITE",
      usuario: `${nomeUsuario} (reatribuído de ${existente.transportador} para ${transportador})`,
    },
  });
  return { ok: true as const, pedido, criado: false };
}

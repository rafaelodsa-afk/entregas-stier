import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { podeVerTudo } from "@/lib/auth";

// Mesma regra do protótipo: essas formas de pagamento deixam o pedido
// "aguardando acerto" assim que é entregue, até a Stier confirmar o recebimento.
const PAGAMENTOS_A_VISTA = ["DINHEIRO", "PIX", "A VISTA", "AVISTA"];

function papelDaSessao(req: NextRequest) {
  return (req.headers.get("x-user-papel") ?? "TRANSPORTADOR") as
    | "MASTER"
    | "ADMIN"
    | "ANALISTA"
    | "TRANSPORTADOR";
}

export async function GET(req: NextRequest) {
  const papel = papelDaSessao(req);
  const transportador = req.headers.get("x-user-transportador") ?? "";

  const where = podeVerTudo(papel) ? {} : { transportador: transportador || "___nenhum___" };
  const pedidos = await prisma.pedido.findMany({
    where,
    orderBy: { dataCriacao: "desc" },
  });

  return NextResponse.json(pedidos);
}

export async function POST(req: NextRequest) {
  const papel = papelDaSessao(req);
  if (!podeVerTudo(papel)) {
    return NextResponse.json({ erro: "Sem permissão para criar pedidos" }, { status: 403 });
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "Requisição inválida" }, { status: 400 });
  }

  const id = String(body.id ?? "").trim();
  const cliente = String(body.cliente ?? "").trim();
  const transportador = String(body.transportador ?? "").trim();
  if (!id || !cliente || !transportador) {
    return NextResponse.json({ erro: "Preencha nº do pedido, cliente e transportador" }, { status: 400 });
  }

  const dados = {
    cliente,
    cidade: String(body.cidade ?? "").trim(),
    bairro: String(body.bairro ?? "").trim(),
    rua: String(body.rua ?? "").trim(),
    numero: String(body.numero ?? "").trim(),
    transportador,
    formaPagamento: String(body.formaPagamento ?? "BOLETO").trim().toUpperCase(),
    valorPedido: Number(body.valorPedido) || 0,
    prazo: String(body.prazo ?? "").trim(),
  };

  const existente = await prisma.pedido.findUnique({ where: { id } });

  if (!existente) {
    const pedido = await prisma.pedido.create({
      data: { id, ...dados, statusEntrega: "AGUARDANDO_ACEITE", statusFinanceiro: "NA" },
    });
    await prisma.historicoPedido.create({
      data: { pedidoId: id, status: "AGUARDANDO_ACEITE", usuario: req.headers.get("x-user-nome") ?? "sistema" },
    });
    return NextResponse.json(pedido, { status: 201 });
  }

  // Regra de negócio: só um pedido em reentrega pode ser reatribuído a um novo
  // transportador reimportando o mesmo nº. Entregue/cancelado nunca são reabertos.
  if (existente.statusEntrega !== "REENTREGA") {
    return NextResponse.json(
      { erro: `Pedido #${id} já existe e não está em reentrega (status atual: ${existente.statusEntrega})` },
      { status: 409 }
    );
  }

  const pedido = await prisma.pedido.update({
    where: { id },
    data: { ...dados, statusEntrega: "AGUARDANDO_ACEITE", statusFinanceiro: "NA", dataEntrega: null, observacaoProblema: null },
  });
  await prisma.historicoPedido.create({
    data: {
      pedidoId: id,
      status: "AGUARDANDO_ACEITE",
      usuario: `${req.headers.get("x-user-nome") ?? "sistema"} (reatribuído de ${existente.transportador} para ${transportador})`,
    },
  });
  return NextResponse.json(pedido);
}

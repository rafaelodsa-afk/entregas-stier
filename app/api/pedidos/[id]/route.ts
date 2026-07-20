import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { podeVerTudo } from "@/lib/auth";

const PAGAMENTOS_A_VISTA = ["DINHEIRO", "PIX", "A VISTA", "AVISTA"];
const STATUS_VALIDOS = [
  "AGUARDANDO_ACEITE",
  "AGUARDANDO_CARREGAMENTO",
  "EM_ROTA",
  "ENTREGUE",
  "REENTREGA",
  "CANCELADO",
  "DEVOLVIDO",
];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const papel = (req.headers.get("x-user-papel") ?? "TRANSPORTADOR") as
    | "MASTER"
    | "ADMIN"
    | "ANALISTA"
    | "TRANSPORTADOR";
  const transportadorSessao = req.headers.get("x-user-transportador") ?? "";
  const nomeUsuario = req.headers.get("x-user-nome") ?? "sistema";

  const pedido = await prisma.pedido.findUnique({ where: { id: params.id } });
  if (!pedido) {
    return NextResponse.json({ erro: "Pedido não encontrado" }, { status: 404 });
  }

  // Transportador só mexe nos próprios pedidos.
  if (papel === "TRANSPORTADOR" && pedido.transportador !== transportadorSessao) {
    return NextResponse.json({ erro: "Sem permissão sobre este pedido" }, { status: 403 });
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "Requisição inválida" }, { status: 400 });
  }

  const data: Record<string, any> = {};
  let statusParaHistorico = pedido.statusEntrega;

  switch (body.acao) {
    case "avancarStatus": {
      // aceitar pedido / iniciar rota — qualquer papel autorizado sobre o pedido
      if (!STATUS_VALIDOS.includes(body.statusEntrega)) {
        return NextResponse.json({ erro: "Status inválido" }, { status: 400 });
      }
      data.statusEntrega = body.statusEntrega;
      statusParaHistorico = body.statusEntrega;
      break;
    }
    case "finalizarEntrega": {
      data.statusEntrega = "ENTREGUE";
      data.dataEntrega = new Date();
      data.statusFinanceiro = PAGAMENTOS_A_VISTA.includes((pedido.formaPagamento || "").toUpperCase())
        ? "AGUARDANDO_ACERTO"
        : "NA";
      if (body.canhotoUrl) {
        data.canhotoUrl = body.canhotoUrl;
        data.canhotoTipo = body.canhotoTipo || "foto";
      }
      statusParaHistorico = "ENTREGUE";
      break;
    }
    case "reportarProblema": {
      if (!["REENTREGA", "DEVOLVIDO", "CANCELADO"].includes(body.statusEntrega)) {
        return NextResponse.json({ erro: "Status inválido para essa ação" }, { status: 400 });
      }
      data.statusEntrega = body.statusEntrega;
      data.observacaoProblema = body.observacao ?? null;
      statusParaHistorico = body.statusEntrega;
      break;
    }
    case "confirmarAcerto": {
      if (!podeVerTudo(papel)) {
        return NextResponse.json({ erro: "Sem permissão para confirmar acerto" }, { status: 403 });
      }
      data.statusFinanceiro = "PAGO";
      data.acertoConfirmadoEm = new Date();
      break;
    }
    case "alterarStatusManual": {
      // ajuste administrativo direto — só quem enxerga tudo pode fazer
      if (!podeVerTudo(papel)) {
        return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
      }
      if (!STATUS_VALIDOS.includes(body.statusEntrega)) {
        return NextResponse.json({ erro: "Status inválido" }, { status: 400 });
      }
      data.statusEntrega = body.statusEntrega;
      statusParaHistorico = body.statusEntrega;
      break;
    }
    default:
      return NextResponse.json({ erro: "Ação desconhecida" }, { status: 400 });
  }

  const atualizado = await prisma.pedido.update({ where: { id: params.id }, data });
  await prisma.historicoPedido.create({
    data: { pedidoId: params.id, status: statusParaHistorico, usuario: nomeUsuario },
  });

  return NextResponse.json(atualizado);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const papel = (req.headers.get("x-user-papel") ?? "TRANSPORTADOR") as
    | "MASTER"
    | "ADMIN"
    | "ANALISTA"
    | "TRANSPORTADOR";
  if (!podeVerTudo(papel)) {
    return NextResponse.json({ erro: "Sem permissão para excluir pedidos" }, { status: 403 });
  }

  const pedido = await prisma.pedido.findUnique({ where: { id: params.id } });
  if (!pedido) {
    return NextResponse.json({ erro: "Pedido não encontrado" }, { status: 404 });
  }

  // HistoricoPedido é apagado junto (onDelete: Cascade no schema).
  await prisma.pedido.delete({ where: { id: params.id } });

  return NextResponse.json({ ok: true });
}

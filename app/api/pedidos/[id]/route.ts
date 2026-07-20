import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { podeVerTudo } from "@/lib/auth";
import { ehOperacaoDeVenda } from "@/lib/pedidos";

// Compara nomes de transportador ignorando maiúsculas/minúsculas e espaços
// extras — pra um espaço a mais no cadastro não travar o próprio dono do
// pedido, nem (na direção oposta) nunca deixar passar alguém de fora.
function mesmoTransportador(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

const PAGAMENTOS_A_VISTA = ["DINHEIRO", "PIX", "A VISTA", "AVISTA"];
const STATUS_VALIDOS = [
  "AGUARDANDO_ACEITE",
  "AGUARDANDO_CARREGAMENTO",
  "EM_ROTA",
  "AGUARDANDO_CANHOTO",
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
  if (papel === "TRANSPORTADOR" && !mesmoTransportador(pedido.transportador, transportadorSessao)) {
    return NextResponse.json({ erro: "Sem permissão sobre este pedido" }, { status: 403 });
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "Requisição inválida" }, { status: 400 });
  }

  const data: Record<string, any> = {};
  let statusParaHistorico: string = pedido.statusEntrega;

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
      // Só vira pendência financeira se for Venda (padrão quando a
      // planilha não informa operação) E o pagamento for à vista.
      data.statusFinanceiro =
        ehOperacaoDeVenda(pedido.operacao) && PAGAMENTOS_A_VISTA.includes((pedido.formaPagamento || "").toUpperCase())
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
    case "anexarComprovantePagamento": {
      // Só evidência — nunca confirma o acerto sozinho, isso continua
      // exigindo uma ação separada de admin/analista/master.
      if (pedido.statusFinanceiro !== "AGUARDANDO_ACERTO") {
        return NextResponse.json({ erro: "Este pedido não está aguardando acerto financeiro" }, { status: 400 });
      }
      if (!body.comprovanteUrl) {
        return NextResponse.json({ erro: "Envie o comprovante" }, { status: 400 });
      }
      data.comprovantePagamentoUrl = body.comprovanteUrl;
      data.comprovantePagamentoTipo = body.comprovanteTipo || "foto";
      statusParaHistorico = "Comprovante de pagamento anexado";
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

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { podeVerTudo, podeFinalizarSemCanhoto } from "@/lib/auth";
import { geraPendenciaFinanceira } from "@/lib/pedidos";
import { arquivoValido, apagarArquivosR2 } from "@/lib/r2";

// Compara nomes de transportador ignorando maiúsculas/minúsculas e espaços
// extras — pra um espaço a mais no cadastro não travar o próprio dono do
// pedido, nem (na direção oposta) nunca deixar passar alguém de fora.
function mesmoTransportador(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

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

// Únicas transições que "avancarStatus" pode fazer (aceitar pedido / iniciar
// rota) — chave é o status ATUAL do pedido, valor é o único próximo status
// aceito. Qualquer outra combinação (inclusive pular direto pra ENTREGUE)
// é rejeitada; isso é intencional, não confia em STATUS_VALIDOS aqui.
const TRANSICOES_AVANCAR_STATUS: Record<string, string> = {
  AGUARDANDO_ACEITE: "AGUARDANDO_CARREGAMENTO",
  AGUARDANDO_CARREGAMENTO: "EM_ROTA",
};

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const papel = (req.headers.get("x-user-papel") ?? "TRANSPORTADOR") as
    | "MASTER"
    | "ADMIN"
    | "ANALISTA"
    | "TRANSPORTADOR";
  const transportadorSessao = decodeURIComponent(req.headers.get("x-user-transportador") ?? "");
  const nomeUsuario = decodeURIComponent(req.headers.get("x-user-nome") ?? "sistema");

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
      // Aceitar pedido / iniciar rota — só as duas transições reais que a
      // tela oferece, e só a partir do status atual de verdade do pedido
      // (nunca pula etapa nem aceita um status arbitrário só porque está
      // na lista geral de status válidos).
      const proximoEsperado = TRANSICOES_AVANCAR_STATUS[pedido.statusEntrega];
      if (!proximoEsperado || body.statusEntrega !== proximoEsperado) {
        return NextResponse.json({ erro: "Transição de status inválida" }, { status: 400 });
      }
      data.statusEntrega = body.statusEntrega;
      statusParaHistorico = body.statusEntrega;
      break;
    }
    case "finalizarEntrega": {
      // Só pode finalizar depois que o transportador aceitou o pedido —
      // sem isso não faz sentido ter canhoto de uma entrega que nem começou.
      if (pedido.statusEntrega === "AGUARDANDO_ACEITE") {
        return NextResponse.json({ erro: "Este pedido ainda não foi aceito" }, { status: 400 });
      }
      // Canhoto é obrigatório de verdade aqui (não só na tela) — sem isso
      // não tem como provar que o pedido foi entregue.
      if (!body.canhotoUrl) {
        return NextResponse.json({ erro: "Envie o canhoto" }, { status: 400 });
      }
      // Confere DE VERDADE o que foi enviado (bytes reais, não só o
      // Content-Type que o navegador declarou) — só aceita e vincula ao
      // pedido se bater; senão apaga o que quer que tenha sido enviado.
      if (!(await arquivoValido(body.canhotoUrl))) {
        await apagarArquivosR2([body.canhotoUrl]);
        return NextResponse.json({ erro: "O arquivo enviado não é uma foto ou PDF válido." }, { status: 400 });
      }
      data.statusEntrega = "ENTREGUE";
      data.dataEntrega = new Date();
      // Só vira pendência financeira se for Venda (padrão quando a
      // planilha não informa operação) E o pagamento for à vista.
      data.statusFinanceiro = geraPendenciaFinanceira(pedido.operacao, pedido.formaPagamento) ? "AGUARDANDO_ACERTO" : "NA";
      data.canhotoUrl = body.canhotoUrl;
      data.canhotoTipo = body.canhotoTipo || "foto";
      // Reenviar o canhoto resolve sozinho um alerta de rejeição anterior
      // (a observação em si continua registrada, só o "ativo" muda).
      if (pedido.alertaRejeicaoCanhoto) {
        data.alertaRejeicaoCanhoto = false;
      }
      statusParaHistorico = "ENTREGUE";
      break;
    }
    case "finalizarSemComprovante": {
      // Só pra pedidos legados (anteriores ao sistema) — pula a exigência
      // de canhoto, então fica restrito a master/admin e sempre exige uma
      // justificativa registrada permanentemente.
      if (!podeFinalizarSemCanhoto(papel)) {
        return NextResponse.json({ erro: "Sem permissão para finalizar sem comprovante" }, { status: 403 });
      }
      const justificativa = String(body.justificativa ?? "").trim();
      if (!justificativa) {
        return NextResponse.json({ erro: "Informe uma justificativa" }, { status: 400 });
      }
      data.statusEntrega = "ENTREGUE";
      data.dataEntrega = new Date();
      data.statusFinanceiro = geraPendenciaFinanceira(pedido.operacao, pedido.formaPagamento) ? "AGUARDANDO_ACERTO" : "NA";
      data.finalizadoSemCanhoto = true;
      data.justificativaSemCanhoto = justificativa;
      statusParaHistorico = `Entregue sem comprovante (pedido legado) — ${justificativa}`;
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
      if (!(await arquivoValido(body.comprovanteUrl))) {
        await apagarArquivosR2([body.comprovanteUrl]);
        return NextResponse.json({ erro: "O arquivo enviado não é uma foto ou PDF válido." }, { status: 400 });
      }
      data.comprovantePagamentoUrl = body.comprovanteUrl;
      data.comprovantePagamentoTipo = body.comprovanteTipo || "foto";
      if (pedido.alertaRejeicaoComprovante) {
        data.alertaRejeicaoComprovante = false;
      }
      statusParaHistorico = "Comprovante de pagamento anexado";
      break;
    }
    case "sinalizarProblema": {
      // Só um alerta com observação — nunca mexe no statusEntrega, o pedido
      // segue o fluxo normal (aceitar, iniciar rota, canhoto, etc.) mesmo
      // com o alerta ativo.
      const observacao = String(body.observacao ?? "").trim();
      if (!observacao) {
        return NextResponse.json({ erro: "Descreva o problema" }, { status: 400 });
      }
      data.alertaProblema = true;
      data.alertaProblemaObservacao = observacao;
      statusParaHistorico = `Problema sinalizado pelo transportador: ${observacao}`;
      break;
    }
    case "resolverAlertaProblema": {
      if (!podeVerTudo(papel)) {
        return NextResponse.json({ erro: "Sem permissão para resolver o alerta" }, { status: 403 });
      }
      // A observação em si NUNCA é apagada — só para de contar como
      // pendente. Continua visível pra sempre no detalhe do pedido.
      data.alertaProblema = false;
      statusParaHistorico = "Alerta de problema marcado como resolvido";
      break;
    }
    case "rejeitarCanhoto": {
      if (!podeVerTudo(papel)) {
        return NextResponse.json({ erro: "Sem permissão para rejeitar canhoto" }, { status: 403 });
      }
      if (!pedido.canhotoUrl) {
        return NextResponse.json({ erro: "Este pedido não tem canhoto anexado" }, { status: 400 });
      }
      const motivo = String(body.observacao ?? "").trim();
      if (!motivo) {
        return NextResponse.json({ erro: "Descreva o motivo da rejeição" }, { status: 400 });
      }
      await apagarArquivosR2([pedido.canhotoUrl]);
      data.canhotoUrl = null;
      data.canhotoTipo = null;
      data.dataEntrega = null;
      data.statusEntrega = "EM_ROTA";
      // Só reverte o financeiro se a pendência veio dessa própria entrega
      // (ainda não confirmada) — se já foi paga, isso não deveria acontecer
      // na prática, mas por segurança não mexe em PAGO.
      if (pedido.statusFinanceiro === "AGUARDANDO_ACERTO") {
        data.statusFinanceiro = "NA";
      }
      data.alertaRejeicaoCanhoto = true;
      data.alertaRejeicaoCanhotoObservacao = motivo;
      statusParaHistorico = `Canhoto rejeitado — voltou pra Em rota: ${motivo}`;
      break;
    }
    case "rejeitarComprovante": {
      if (!podeVerTudo(papel)) {
        return NextResponse.json({ erro: "Sem permissão para rejeitar comprovante" }, { status: 403 });
      }
      if (!pedido.comprovantePagamentoUrl) {
        return NextResponse.json({ erro: "Este pedido não tem comprovante de pagamento anexado" }, { status: 400 });
      }
      const motivo = String(body.observacao ?? "").trim();
      if (!motivo) {
        return NextResponse.json({ erro: "Descreva o motivo da rejeição" }, { status: 400 });
      }
      await apagarArquivosR2([pedido.comprovantePagamentoUrl]);
      data.comprovantePagamentoUrl = null;
      data.comprovantePagamentoTipo = null;
      data.alertaRejeicaoComprovante = true;
      data.alertaRejeicaoComprovanteObservacao = motivo;
      statusParaHistorico = `Comprovante de pagamento rejeitado: ${motivo}`;
      break;
    }
    case "confirmarAcerto": {
      if (!podeVerTudo(papel)) {
        return NextResponse.json({ erro: "Sem permissão para confirmar acerto" }, { status: 403 });
      }
      data.statusFinanceiro = "PAGO";
      data.acertoConfirmadoEm = new Date();
      data.acertoConfirmadoPor = nomeUsuario;
      statusParaHistorico = `Acerto financeiro confirmado por ${nomeUsuario}`;
      break;
    }
    case "aceitarPeloTransportador": {
      // Admin/analista aceita em nome do transportador — mesma permissão
      // de quem pode alterar status manualmente.
      if (!podeVerTudo(papel)) {
        return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
      }
      if (pedido.statusEntrega !== "AGUARDANDO_ACEITE") {
        return NextResponse.json({ erro: "Pedido não está aguardando aceite" }, { status: 400 });
      }
      data.statusEntrega = "AGUARDANDO_CARREGAMENTO";
      statusParaHistorico = `AGUARDANDO_CARREGAMENTO (aceito por ${nomeUsuario} no lugar do transportador)`;
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

  // Marca quando o pedido entrou em Reentrega (pra saber há quanto tempo
  // está parado) e limpa assim que sai desse status, seja qual for a ação.
  if (data.statusEntrega && data.statusEntrega !== pedido.statusEntrega) {
    if (data.statusEntrega === "REENTREGA") {
      data.dataReentrega = new Date();
    } else if (pedido.statusEntrega === "REENTREGA") {
      data.dataReentrega = null;
    }
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

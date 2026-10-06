import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { podeVerTudo, type Papel } from "@/lib/auth";
import { geraPendenciaFinanceira, ehOperacaoDeVenda, ehPagamentoAVista } from "@/lib/pedidos";
import { LABEL_STATUS } from "@/lib/statusLabels";
import { filtroTransportadorVisivel } from "@/lib/transportador";
import {
  novaPlanilha,
  planilhaParaBuffer,
  adicionarAba,
  adicionarAbaResumoPorTransportador,
  adicionarAbaContagem,
  adicionarCapa,
  FORMATO_MOEDA,
  FORMATO_INTEIRO,
  PRIMEIRA_LINHA_DADOS,
  type Coluna,
  type CartaoCapa,
} from "@/lib/relatorioExcel";

// Gerar a planilha de 11 mil linhas com formatação leva alguns segundos.
export const maxDuration = 60;

const LABEL_FINANCEIRO: Record<string, string> = {
  NA: "Não se aplica",
  AGUARDANDO_ACERTO: "Aguardando acerto",
  PAGO: "Pago",
};

const LABEL_PAGAMENTO: Record<string, string> = {
  DINHEIRO: "Dinheiro",
  PIX: "PIX",
  BOLETO: "Boleto",
};

const LABEL_OPERACAO: Record<string, string> = {
  VENDA: "Venda",
  BONIFICACAO: "Bonificação",
  TRANSFERENCIA: "Transferência",
  REMESSA: "Remessa",
};

type LinhaPedido = {
  id: string;
  cliente: string;
  transportador: string;
  cidade: string;
  bairro: string;
  operacao: string;
  formaPagamento: string;
  statusEntrega: string;
  statusPlanilha: string | null;
  statusFinanceiro: string;
  valorPedido: unknown;
  dataPedido: Date | null;
  dataEntrega: Date | null;
  acertoConfirmadoEm: Date | null;
  acertoConfirmadoPor: string | null;
  finalizadoSemCanhoto: boolean;
  canhotoUrl: string | null;
  comprovantePagamentoUrl: string | null;
};

const SELECT_PEDIDO = {
  id: true,
  cliente: true,
  transportador: true,
  cidade: true,
  bairro: true,
  operacao: true,
  formaPagamento: true,
  statusEntrega: true,
  statusPlanilha: true,
  statusFinanceiro: true,
  valorPedido: true,
  dataPedido: true,
  dataEntrega: true,
  acertoConfirmadoEm: true,
  acertoConfirmadoPor: true,
  finalizadoSemCanhoto: true,
  canhotoUrl: true,
  comprovantePagamentoUrl: true,
} as const;

function rotuloStatus(p: LinhaPedido) {
  if (p.statusEntrega === "ENTREGUE" && p.finalizadoSemCanhoto) return "Entregue (sem comprovante)";
  return LABEL_STATUS[p.statusEntrega] ?? p.statusEntrega;
}

// "Entregue sem comprovante" tem cor própria na planilha, igual às telas.
function chaveStatus(p: LinhaPedido) {
  if (p.statusEntrega === "ENTREGUE" && p.finalizadoSemCanhoto) return "ENTREGUE_SEM_COMPROVANTE";
  return p.statusEntrega;
}

function colunasPedido(): Coluna<LinhaPedido>[] {
  return [
    { titulo: "Nº do pedido", largura: 16, valor: (p) => p.id },
    { titulo: "Cliente", largura: 38, valor: (p) => p.cliente },
    { titulo: "Transportador", largura: 26, valor: (p) => p.transportador },
    { titulo: "Cidade", largura: 20, valor: (p) => p.cidade || "—" },
    { titulo: "Bairro", largura: 20, valor: (p) => p.bairro || "—" },
    { titulo: "Operação", largura: 16, valor: (p) => LABEL_OPERACAO[p.operacao] ?? p.operacao },
    { titulo: "Pagamento", largura: 16, valor: (p) => LABEL_PAGAMENTO[p.formaPagamento] ?? p.formaPagamento },
    { titulo: "Status da entrega", largura: 30, tipo: "status", valor: (p) => rotuloStatus(p), chaveStatus },
    { titulo: "Status na planilha", largura: 18, valor: (p) => p.statusPlanilha || "—" },
    { titulo: "Financeiro", largura: 20, valor: (p) => LABEL_FINANCEIRO[p.statusFinanceiro] ?? p.statusFinanceiro },
    { titulo: "Valor", largura: 16, tipo: "moeda", valor: (p) => Number(p.valorPedido), somar: true },
    { titulo: "Data do pedido", largura: 16, tipo: "data", valor: (p) => p.dataPedido },
    { titulo: "Entregue em", largura: 16, tipo: "data", valor: (p) => p.dataEntrega },
    { titulo: "Tem canhoto", largura: 14, tipo: "sim_nao", valor: (p) => (p.canhotoUrl ? "Sim" : "Não") },
    { titulo: "Tem comprovante", largura: 16, tipo: "sim_nao", valor: (p) => (p.comprovantePagamentoUrl ? "Sim" : "Não") },
  ];
}

const COLUNA_TRANSPORTADOR = "C"; // 3ª coluna de colunasPedido()
const COLUNA_VALOR = "K"; // 11ª coluna de colunasPedido()

function nomeArquivo(prefixo: string) {
  const agora = new Date();
  const carimbo = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}_${String(agora.getHours()).padStart(2, "0")}${String(agora.getMinutes()).padStart(2, "0")}`;
  return `${prefixo}_${carimbo}.xlsx`;
}

export async function POST(req: NextRequest) {
  const papel = (req.headers.get("x-user-papel") ?? "TRANSPORTADOR") as Papel;
  const transportadorSessao = decodeURIComponent(req.headers.get("x-user-transportador") ?? "").trim();
  const nomeUsuario = decodeURIComponent(req.headers.get("x-user-nome") ?? "sistema");
  const ehVisaoTotal = podeVerTudo(papel);

  let body: Record<string, any> = {};
  try {
    body = await req.json();
  } catch {
    // corpo vazio = exporta tudo que a pessoa pode ver
  }

  const tipo = String(body.tipo ?? "pedidos");
  // Quando a tela manda os ids que estão na frente da pessoa (filtro/seleção
  // aplicados no navegador), a planilha sai exatamente igual ao que ela vê.
  const idsPedidos: string[] | null = Array.isArray(body.ids) && body.ids.length > 0 ? body.ids.map(String) : null;

  // Transportador só exporta o que ele vê nas telas — mesma regra central
  // (inclui o balde compartilhado da frota, pra motorista da frota própria).
  const whereBase = ehVisaoTotal ? {} : filtroTransportadorVisivel(transportadorSessao);

  const wb = novaPlanilha();

  if (tipo === "financeiro") {
    if (!ehVisaoTotal) {
      return NextResponse.json({ erro: "Sem permissão para o relatório financeiro" }, { status: 403 });
    }

    const [candidatosPrevisto, aguardandoAcerto, pagos] = await Promise.all([
      prisma.pedido.findMany({
        where: { statusEntrega: { in: ["AGUARDANDO_CARREGAMENTO", "EM_ROTA", "AGUARDANDO_CANHOTO"] } },
        orderBy: { dataCriacao: "asc" },
        select: SELECT_PEDIDO,
      }),
      prisma.pedido.findMany({
        where: { statusFinanceiro: "AGUARDANDO_ACERTO" },
        orderBy: { dataEntrega: "asc" },
        select: SELECT_PEDIDO,
      }),
      prisma.pedido.findMany({
        where: { statusFinanceiro: "PAGO" },
        orderBy: { acertoConfirmadoEm: "desc" },
        select: SELECT_PEDIDO,
      }),
    ]);

    // Mesma regra da tela: só Venda à vista entra no previsto.
    const previstos = candidatosPrevisto.filter(
      (p) => ehOperacaoDeVenda(p.operacao) && ehPagamentoAVista(p.formaPagamento)
    );

    const colunasAcerto = colunasPedido();
    const colunasPagos: Coluna<LinhaPedido>[] = [
      ...colunasPedido(),
      { titulo: "Recebido em", largura: 16, tipo: "data", valor: (p) => p.acertoConfirmadoEm },
      { titulo: "Confirmado por", largura: 24, valor: (p) => p.acertoConfirmadoPor || "—" },
    ];

    const somaPrevisto = previstos.reduce((s, p) => s + Number(p.valorPedido), 0);
    const somaAcerto = aguardandoAcerto.reduce((s, p) => s + Number(p.valorPedido), 0);
    const somaPago = pagos.reduce((s, p) => s + Number(p.valorPedido), 0);

    adicionarCapa(wb, {
      titulo: "Relatório Financeiro",
      subtitulo: "Acertos a receber, previsto e histórico",
      geradoPor: nomeUsuario,
      cartoes: [
        { rotulo: "Aguardando acerto", valor: somaAcerto, formato: FORMATO_MOEDA, destaque: true },
        { rotulo: "Pedidos aguardando acerto", valor: aguardandoAcerto.length, formato: FORMATO_INTEIRO, destaque: true },
        { rotulo: "Previsto (ainda não entregue)", valor: somaPrevisto, formato: FORMATO_MOEDA },
        { rotulo: "Pedidos previstos", valor: previstos.length, formato: FORMATO_INTEIRO },
        { rotulo: "Já recebido (pago)", valor: somaPago, formato: FORMATO_MOEDA },
        { rotulo: "Pedidos já pagos", valor: pagos.length, formato: FORMATO_INTEIRO },
      ],
      abas: [
        { nome: "Panorama financeiro", descricao: "As três situações em uma tabela, com quantidade e valor." },
        { nome: "Aguardando acerto", descricao: "Entregue com pagamento à vista e ainda não recebido — o que cobrar." },
        { nome: "Resumo por transportador", descricao: "Quanto cada transportador tem a acertar (em fórmula)." },
        { nome: "Previsto", descricao: "Venda à vista aceita, ainda não entregue — vai virar acerto." },
        { nome: "Recebidos", descricao: "Histórico do que já foi confirmado, com quem confirmou e quando." },
      ],
    });

    adicionarAbaContagem(wb, {
      nome: "Panorama financeiro",
      titulo: "Panorama financeiro",
      rotuloColuna: "Situação",
      linhas: [
        { rotulo: "Previsto — ainda não entregue", quantidade: previstos.length, valor: somaPrevisto },
        { rotulo: "Aguardando acerto", quantidade: aguardandoAcerto.length, valor: somaAcerto },
        { rotulo: "Já recebido (pago)", quantidade: pagos.length, valor: somaPago },
      ],
    });

    adicionarAba(wb, {
      nome: "Aguardando acerto",
      titulo: "Aguardando acerto",
      subtitulo: `${aguardandoAcerto.length} pedido(s) entregues com pagamento à vista ainda não recebido — gerado em ${new Date().toLocaleString("pt-BR")}`,
      colunas: colunasAcerto,
      itens: aguardandoAcerto,
    });
    if (aguardandoAcerto.length > 0) {
      adicionarAbaResumoPorTransportador(wb, {
        nomeAbaDetalhe: "Aguardando acerto",
        transportadores: [...new Set(aguardandoAcerto.map((p) => p.transportador))].sort(),
        colunaTransportador: COLUNA_TRANSPORTADOR,
        colunaValor: COLUNA_VALOR,
        primeiraLinhaDados: PRIMEIRA_LINHA_DADOS,
        ultimaLinhaDados: PRIMEIRA_LINHA_DADOS + aguardandoAcerto.length - 1,
      });
    }

    adicionarAba(wb, {
      nome: "Previsto",
      titulo: "Previsto — ainda não entregue",
      colunas: colunasPedido(),
      itens: previstos,
    });

    adicionarAba(wb, {
      nome: "Recebidos",
      titulo: "Histórico de acertos recebidos",
      colunas: colunasPagos,
      itens: pagos,
    });

    const buffer = await planilhaParaBuffer(wb);
    return new NextResponse(buffer as any, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nomeArquivo("financeiro_stier")}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // ----- tipo "pedidos" (padrão) -----
  const where = idsPedidos ? { AND: [whereBase, { id: { in: idsPedidos } }] } : whereBase;
  const pedidos = await prisma.pedido.findMany({
    where,
    orderBy: { dataCriacao: "desc" },
    select: SELECT_PEDIDO,
  });

  const transportadores = [...new Set(pedidos.map((p) => p.transportador))].sort();
  const rotuloRecorte = idsPedidos
    ? `${pedidos.length} pedido(s) — recorte exatamente como estava na tela (filtros/seleção aplicados)`
    : `${pedidos.length} pedido(s) — base completa`;

  // Panorama por status primeiro: é o que a pessoa olha antes do detalhe.
  // "Entregue" e "Entregue (sem comprovante)" aparecem separados, igual na
  // tela — são situações bem diferentes pra quem lê o relatório.
  const gruposStatus: { chave: string; rotulo: string; filtro: (p: LinhaPedido) => boolean }[] = [
    ...Object.keys(LABEL_STATUS).map((chave) => ({
      chave,
      rotulo: LABEL_STATUS[chave],
      filtro: (p: LinhaPedido) =>
        chave === "ENTREGUE"
          ? p.statusEntrega === "ENTREGUE" && !p.finalizadoSemCanhoto
          : p.statusEntrega === chave,
    })),
    {
      chave: "ENTREGUE_SEM_COMPROVANTE",
      rotulo: "Entregue (sem comprovante)",
      filtro: (p: LinhaPedido) => p.statusEntrega === "ENTREGUE" && p.finalizadoSemCanhoto,
    },
  ];

  const porStatus = gruposStatus
    .map((g) => {
      const doStatus = pedidos.filter(g.filtro);
      return {
        rotulo: g.rotulo,
        chaveStatus: g.chave,
        quantidade: doStatus.length,
        valor: doStatus.reduce((s, p) => s + Number(p.valorPedido), 0),
      };
    })
    .filter((l) => l.quantidade > 0);

  // Uma aba por transportador é ótima pra mandar o recorte de um só, mas
  // repetir a base inteira transportador por transportador dobraria o arquivo
  // e o tempo de geração. Então: sai sempre que o recorte for de tamanho
  // razoável; na base completa fica só o resumo (que já tem o total de cada
  // um) mais o filtro automático da aba de detalhe.
  const abasPorTransportador = ehVisaoTotal && transportadores.length > 1 && transportadores.length <= 30 && pedidos.length <= 4000;

  const valorTotal = pedidos.reduce((s, p) => s + Number(p.valorPedido), 0);
  const qtdPendentes = pedidos.filter(
    (p) => !["ENTREGUE", "CANCELADO", "DEVOLVIDO", "REENTREGA"].includes(p.statusEntrega)
  ).length;
  const qtdAguardandoAcerto = pedidos.filter((p) => p.statusFinanceiro === "AGUARDANDO_ACERTO").length;
  const qtdSemCanhoto = pedidos.filter((p) => !p.canhotoUrl).length;

  const cartoes: CartaoCapa[] = [
    { rotulo: "Pedidos no relatório", valor: pedidos.length, formato: FORMATO_INTEIRO, destaque: true },
    { rotulo: "Valor total", valor: valorTotal, formato: FORMATO_MOEDA, destaque: true },
    { rotulo: "Pendentes de entrega", valor: qtdPendentes, formato: FORMATO_INTEIRO },
    { rotulo: "Aguardando acerto financeiro", valor: qtdAguardandoAcerto, formato: FORMATO_INTEIRO },
    { rotulo: "Sem canhoto anexado", valor: qtdSemCanhoto, formato: FORMATO_INTEIRO },
    { rotulo: "Transportadores envolvidos", valor: transportadores.length, formato: FORMATO_INTEIRO },
  ];

  const descricaoAbas = [
    { nome: "Panorama por status", descricao: "Quantos pedidos e quanto valor em cada status de entrega." },
    { nome: "Pedidos", descricao: "O detalhe linha por linha, com filtro no cabeçalho e total que acompanha o filtro." },
  ];
  if (ehVisaoTotal && pedidos.length > 0) {
    descricaoAbas.push({
      nome: "Resumo por transportador",
      descricao: "Quantidade, valor e participação de cada transportador (tudo em fórmula).",
    });
  }

  adicionarCapa(wb, {
    titulo: "Relatório de Pedidos",
    subtitulo: idsPedidos ? "Recorte exatamente como estava na tela" : "Base completa",
    geradoPor: nomeUsuario,
    cartoes,
    abas: descricaoAbas,
    mostrarLegendaStatus: true,
  });

  adicionarAbaContagem(wb, {
    nome: "Panorama por status",
    titulo: "Panorama por status de entrega",
    rotuloColuna: "Status",
    linhas: porStatus,
  });
  // Deixa explícito na planilha por que as abas individuais não vieram.
  if (ehVisaoTotal && transportadores.length > 1 && !abasPorTransportador) {
    const panorama = wb.getWorksheet("Panorama por status");
    if (panorama) {
      const linha = panorama.getRow(panorama.rowCount + 2);
      linha.getCell(1).value =
        `Este recorte tem ${pedidos.length} pedidos e ${transportadores.length} transportadores — as abas individuais por transportador saem em exportações de até 4.000 pedidos. Use a aba "Resumo por transportador" ou o filtro da aba "Pedidos".`;
      linha.getCell(1).font = { italic: true, size: 10, color: { argb: "FF5A6672" } };
      linha.alignment = { wrapText: false };
    }
  }

  adicionarAba(wb, {
    nome: "Pedidos",
    titulo: "Pedidos",
    subtitulo: `${rotuloRecorte} — gerado em ${new Date().toLocaleString("pt-BR")}`,
    colunas: colunasPedido(),
    itens: pedidos,
  });

  if (pedidos.length > 0 && ehVisaoTotal) {
    adicionarAbaResumoPorTransportador(wb, {
      nomeAbaDetalhe: "Pedidos",
      transportadores,
      colunaTransportador: COLUNA_TRANSPORTADOR,
      colunaValor: COLUNA_VALOR,
      primeiraLinhaDados: PRIMEIRA_LINHA_DADOS,
      ultimaLinhaDados: PRIMEIRA_LINHA_DADOS + pedidos.length - 1,
    });
  }

  if (abasPorTransportador) {
    for (const t of transportadores) {
      const doTransportador = pedidos.filter((p) => p.transportador === t);
      adicionarAba(wb, {
        nome: t,
        titulo: `Pedidos — ${t}`,
        colunas: colunasPedido(),
        itens: doTransportador,
      });
    }
  }

  const buffer = await planilhaParaBuffer(wb);
  return new NextResponse(buffer as any, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeArquivo("pedidos_stier")}"`,
      "Cache-Control": "no-store",
    },
  });
}

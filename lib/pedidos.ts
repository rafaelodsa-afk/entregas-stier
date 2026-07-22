import { prisma } from "@/lib/db";

export type LinhaPedido = {
  id?: unknown;
  cliente?: unknown;
  cidade?: unknown;
  bairro?: unknown;
  rua?: unknown;
  numero?: unknown;
  transportador?: unknown;
  operacao?: unknown;
  formaPagamento?: unknown;
  valorPedido?: unknown;
  prazo?: unknown;
  dataPedido?: unknown;
  dataPrevistaEntrega?: unknown;
};

// Aceita data já como objeto Date (planilha lida com cellDates), número de
// série do Excel (dias desde 1899-12-30), ou texto solto em dd/mm/aaaa ou
// aaaa-mm-dd. Qualquer coisa que não dê pra interpretar vira null, sem erro.
//
// Sempre grava como meia-noite UTC — é uma DATA pura (sem hora), não um
// instante específico. Guardar assim (e sempre exibir com timeZone "UTC",
// ver lib/formatarData.ts) evita que o dia mude sozinho dependendo de o
// servidor rodar no fuso de Brasília (dev local) ou UTC (Vercel).
export function parseDataPrevista(valorCru: unknown): Date | null {
  if (valorCru === null || valorCru === undefined || valorCru === "") return null;
  if (valorCru instanceof Date) {
    if (isNaN(valorCru.getTime())) return null;
    return new Date(Date.UTC(valorCru.getFullYear(), valorCru.getMonth(), valorCru.getDate()));
  }
  if (typeof valorCru === "number") {
    const data = new Date(Math.round((valorCru - 25569) * 86400 * 1000));
    return isNaN(data.getTime()) ? null : data;
  }
  const texto = String(valorCru).trim();
  if (!texto) return null;
  const bra = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (bra) {
    const [, d, m, y] = bra;
    const ano = y.length === 2 ? Number(y) + 2000 : Number(y);
    const data = new Date(Date.UTC(ano, Number(m) - 1, Number(d)));
    return isNaN(data.getTime()) ? null : data;
  }
  const iso = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, y, m, d] = iso;
    const data = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    return isNaN(data.getTime()) ? null : data;
  }
  const generico = new Date(texto);
  return isNaN(generico.getTime()) ? null : generico;
}

// Sem informação de operação (planilha antiga, coluna ausente, cadastro
// manual sem esse campo) => trata como Venda, pra não quebrar o
// comportamento que já existia antes desse campo existir.
function normalizarOperacao(valorCru: unknown): string {
  const texto = String(valorCru ?? "").trim().toUpperCase();
  return texto || "VENDA";
}

// Só operações de Venda geram pendência financeira (Aguardando acerto) —
// bonificação, transferência, remessa, etc. não entram nesse controle,
// mesmo que a forma de pagamento seja dinheiro ou PIX.
export function ehOperacaoDeVenda(operacao: unknown): boolean {
  const texto = normalizarOperacao(operacao);
  return texto === "VENDA" || texto === "VENDAS";
}

const PAGAMENTOS_A_VISTA = ["DINHEIRO", "PIX", "A VISTA", "AVISTA"];

export function ehPagamentoAVista(formaPagamento: unknown): boolean {
  return PAGAMENTOS_A_VISTA.includes(String(formaPagamento ?? "").trim().toUpperCase());
}

// Mesma regra usada tanto pra gerar a pendência real (quando o canhoto é
// anexado) quanto pra prever antecipadamente na aba Financeiro — Venda +
// pagamento à vista, sem depender do status de entrega.
export function geraPendenciaFinanceira(operacao: unknown, formaPagamento: unknown): boolean {
  return ehOperacaoDeVenda(operacao) && ehPagamentoAVista(formaPagamento);
}

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
    operacao: normalizarOperacao(linha.operacao),
    formaPagamento: String(linha.formaPagamento ?? "BOLETO").trim().toUpperCase(),
    valorPedido: Number(linha.valorPedido) || 0,
    prazo: String(linha.prazo ?? "").trim(),
    dataPedido: parseDataPrevista(linha.dataPedido),
    dataPrevistaEntrega: parseDataPrevista(linha.dataPrevistaEntrega),
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
    data: { ...dados, statusEntrega: "AGUARDANDO_ACEITE", statusFinanceiro: "NA", dataEntrega: null, observacaoProblema: null, dataReentrega: null },
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

// Textos reconhecidos pra cada status, já normalizados (sem acento,
// minúsculo, sem hífen/underscore, espaços internos colapsados). Igualdade
// exata, não "contém" — um valor como "A ENTREGAR" (ainda não entregue)
// não pode ser confundido com "Entregue" só por compartilhar a substring
// "entreg".
const TEXTOS_REENTREGA = new Set(["reentrega"]);
const TEXTOS_CANCELADO = new Set(["cancelado", "cancelada"]);
const TEXTOS_ENTREGUE = new Set(["entregue", "entregue com sucesso"]);

// Reconhece o texto solto que veio na coluna opcional "Status de entrega" da
// planilha.
function interpretarStatusPlanilha(valorCru: unknown): "ENTREGUE" | "CANCELADO" | "REENTREGA" | null {
  const texto = String(valorCru ?? "")
    .normalize("NFD")
    .replace(new RegExp(String.fromCharCode(0x5b) + "\\u0300-\\u036f" + String.fromCharCode(0x5d), "g"), "")
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!texto) return null;
  if (TEXTOS_REENTREGA.has(texto)) return "REENTREGA";
  if (TEXTOS_CANCELADO.has(texto)) return "CANCELADO";
  if (TEXTOS_ENTREGUE.has(texto)) return "ENTREGUE";
  return null;
}

// Texto cru (só espaços nas pontas removidos) da coluna "Status de entrega",
// guardado como referência — não é usado pra decidir nada sozinho.
function textoStatusPlanilha(valorCru: unknown): string | null {
  const texto = String(valorCru ?? "").trim();
  return texto || null;
}

export type LinhaImportada = LinhaPedido & {
  linha: number; // número da linha na planilha original, só pra reportar erro/motivo
  statusEntregaPlanilha?: unknown; // valor cru da coluna opcional "Status de entrega"
};

export type ResultadoLinhaImportacao =
  | { linha: number; id: string; classificacao: "novo" }
  | { linha: number; id: string; classificacao: "novo_aguardando_canhoto" }
  | { linha: number; id: string; classificacao: "novo_cancelado" }
  | { linha: number; id: string; classificacao: "reatribuido" }
  | { linha: number; id: string; classificacao: "cancelado_planilha" }
  | { linha: number; id: string; classificacao: "aguardando_canhoto" }
  | { linha: number; id: string; classificacao: "protegido"; motivo: string }
  | { linha: number; id: string; classificacao: "sem_mudanca_operacional" }
  | { linha: number; id: string | null; classificacao: "ignorado"; motivo: string };

function montarDados(linha: LinhaImportada, cliente: string, transportador: string) {
  return {
    cliente,
    cidade: String(linha.cidade ?? "").trim(),
    bairro: String(linha.bairro ?? "").trim(),
    rua: String(linha.rua ?? "").trim(),
    numero: String(linha.numero ?? "").trim(),
    transportador,
    operacao: normalizarOperacao(linha.operacao),
    formaPagamento: String(linha.formaPagamento ?? "BOLETO").trim().toUpperCase(),
    valorPedido: Number(linha.valorPedido) || 0,
    prazo: String(linha.prazo ?? "").trim(),
    dataPedido: parseDataPrevista(linha.dataPedido),
    dataPrevistaEntrega: parseDataPrevista(linha.dataPrevistaEntrega),
  };
}

async function reatribuirPedido(
  id: string,
  dados: ReturnType<typeof montarDados>,
  statusPlanilhaTexto: string | null,
  transportadorAnterior: string,
  nomeUsuario: string
) {
  await prisma.pedido.update({
    where: { id },
    data: {
      ...dados,
      ...(statusPlanilhaTexto ? { statusPlanilha: statusPlanilhaTexto } : {}),
      statusEntrega: "AGUARDANDO_ACEITE",
      statusFinanceiro: "NA",
      dataEntrega: null,
      observacaoProblema: null,
      dataReentrega: null,
    },
  });
  await prisma.historicoPedido.create({
    data: {
      pedidoId: id,
      status: "AGUARDANDO_ACEITE",
      usuario: `${nomeUsuario} (reatribuído de ${transportadorAnterior} para ${dados.transportador})`,
    },
  });
}

// Grava só o campo informativo, sem tocar em mais nada do pedido — usado
// quando o pedido está protegido ou quando nada operacional muda.
async function atualizarSomenteStatusPlanilha(id: string, statusPlanilhaTexto: string | null) {
  if (!statusPlanilhaTexto) return;
  await prisma.pedido.update({ where: { id }, data: { statusPlanilha: statusPlanilhaTexto } });
}

// Classifica (e, se gravar=true, também executa) a importação em massa de
// pedidos. Roda em dois modos com a mesma lógica: modo prévia (gravar=false,
// só olha o banco e diz o que ia acontecer) e modo confirmação (gravar=true,
// aplica de verdade) — assim a prévia nunca fica dessincronizada da ação real.
//
// Pedidos NOVOS: sempre são criados, seja qual for o status que a planilha
// mostrar (Entregue → nasce "Aguardando canhoto"; Cancelado → nasce
// Cancelado; qualquer outra coisa → nasce Aguardando aceite, como sempre).
//
// Pedidos que JÁ EXISTEM — prioridade nessa ordem, parando na primeira que valer:
//   a) ENTREGUE de verdade  → nunca mexe, protegido pra sempre.
//   b) CANCELADO            → nunca mexe, já está encerrado.
//   c/e) REENTREGA (no sistema, ou reportada agora pela planilha) → reatribui,
//        volta pra "Aguardando aceite" com os dados novos da linha.
//   d) Planilha diz "Cancelado" → cancela o pedido no sistema.
//   f) Planilha diz "Entregue"  → muda pra "Aguardando canhoto" (a não ser
//      que já esteja nesse status — aí não muda nada operacional).
//   g) Nada disso → não mexe no status operacional, só atualiza o campo
//      informativo (status reportado pela planilha).
//
// Linhas repetidas (mesmo Nº Pedido) na mesma planilha: só a última conta,
// as anteriores são descartadas silenciosamente antes de processar.
export async function processarImportacao(
  linhasOriginais: LinhaImportada[],
  nomeUsuario: string,
  gravar: boolean
): Promise<ResultadoLinhaImportacao[]> {
  const resultados: ResultadoLinhaImportacao[] = [];

  const indiceDaUltimaOcorrenciaPorId = new Map<string, number>();
  linhasOriginais.forEach((linha, indice) => {
    const id = String(linha.id ?? "").trim();
    if (id) indiceDaUltimaOcorrenciaPorId.set(id, indice);
  });

  for (let indice = 0; indice < linhasOriginais.length; indice++) {
    const linha = linhasOriginais[indice];
    const id = String(linha.id ?? "").trim();

    // Linha repetida (não é a última ocorrência desse Nº Pedido) — descarta sem reportar.
    if (id && indiceDaUltimaOcorrenciaPorId.get(id) !== indice) continue;

    const cliente = String(linha.cliente ?? "").trim();
    const transportador = String(linha.transportador ?? "").trim();

    if (!id || !cliente || !transportador) {
      resultados.push({
        linha: linha.linha,
        id: id || null,
        classificacao: "ignorado",
        motivo: "Preencha nº do pedido, cliente e transportador",
      });
      continue;
    }

    const statusPlanilha = interpretarStatusPlanilha(linha.statusEntregaPlanilha);
    const statusPlanilhaTexto = textoStatusPlanilha(linha.statusEntregaPlanilha);
    const dados = montarDados(linha, cliente, transportador);
    const dadosComInformativo = { ...dados, ...(statusPlanilhaTexto ? { statusPlanilha: statusPlanilhaTexto } : {}) };
    const existente = await prisma.pedido.findUnique({ where: { id } });

    if (!existente) {
      if (statusPlanilha === "CANCELADO") {
        if (gravar) {
          await prisma.pedido.create({
            data: { id, ...dadosComInformativo, statusEntrega: "CANCELADO", statusFinanceiro: "NA" },
          });
          await prisma.historicoPedido.create({
            data: { pedidoId: id, status: "CANCELADO", usuario: `${nomeUsuario} (via importação de planilha)` },
          });
        }
        resultados.push({ linha: linha.linha, id, classificacao: "novo_cancelado" });
        continue;
      }
      if (statusPlanilha === "ENTREGUE") {
        if (gravar) {
          await prisma.pedido.create({
            data: { id, ...dadosComInformativo, statusEntrega: "AGUARDANDO_CANHOTO", statusFinanceiro: "NA" },
          });
          await prisma.historicoPedido.create({
            data: { pedidoId: id, status: "AGUARDANDO_CANHOTO", usuario: `${nomeUsuario} (via importação de planilha)` },
          });
        }
        resultados.push({ linha: linha.linha, id, classificacao: "novo_aguardando_canhoto" });
        continue;
      }
      if (gravar) {
        await prisma.pedido.create({
          data: { id, ...dadosComInformativo, statusEntrega: "AGUARDANDO_ACEITE", statusFinanceiro: "NA" },
        });
        await prisma.historicoPedido.create({
          data: { pedidoId: id, status: "AGUARDANDO_ACEITE", usuario: nomeUsuario },
        });
      }
      resultados.push({ linha: linha.linha, id, classificacao: "novo" });
      continue;
    }

    // a) Entregue de verdade — protegido pra sempre.
    if (existente.statusEntrega === "ENTREGUE") {
      if (gravar) await atualizarSomenteStatusPlanilha(id, statusPlanilhaTexto);
      resultados.push({
        linha: linha.linha,
        id,
        classificacao: "protegido",
        motivo: "Pedido já está Entregue — protegido contra alterações da importação",
      });
      continue;
    }

    // b) Cancelado já está encerrado.
    if (existente.statusEntrega === "CANCELADO") {
      if (gravar) await atualizarSomenteStatusPlanilha(id, statusPlanilhaTexto);
      resultados.push({
        linha: linha.linha,
        id,
        classificacao: "protegido",
        motivo: "Pedido já está Cancelado — não é alterado",
      });
      continue;
    }

    // c/e) Reentrega (no nosso sistema, ou apontada agora pela planilha) → reatribui.
    if (existente.statusEntrega === "REENTREGA" || statusPlanilha === "REENTREGA") {
      if (gravar) await reatribuirPedido(id, dados, statusPlanilhaTexto, existente.transportador, nomeUsuario);
      resultados.push({ linha: linha.linha, id, classificacao: "reatribuido" });
      continue;
    }

    // d) Planilha avisa de um cancelamento novo.
    if (statusPlanilha === "CANCELADO") {
      if (gravar) {
        await prisma.pedido.update({
          where: { id },
          data: {
            statusEntrega: "CANCELADO",
            observacaoProblema: "Cancelado via importação de planilha",
            ...(statusPlanilhaTexto ? { statusPlanilha: statusPlanilhaTexto } : {}),
          },
        });
        await prisma.historicoPedido.create({
          data: { pedidoId: id, status: "CANCELADO", usuario: `${nomeUsuario} (via importação de planilha)` },
        });
      }
      resultados.push({ linha: linha.linha, id, classificacao: "cancelado_planilha" });
      continue;
    }

    // f) Planilha diz "Entregue" — vira Aguardando canhoto (a não ser que já esteja lá).
    if (statusPlanilha === "ENTREGUE") {
      if (existente.statusEntrega === "AGUARDANDO_CANHOTO") {
        if (gravar) await atualizarSomenteStatusPlanilha(id, statusPlanilhaTexto);
        resultados.push({ linha: linha.linha, id, classificacao: "sem_mudanca_operacional" });
        continue;
      }
      if (gravar) {
        await prisma.pedido.update({
          where: { id },
          data: {
            statusEntrega: "AGUARDANDO_CANHOTO",
            ...(statusPlanilhaTexto ? { statusPlanilha: statusPlanilhaTexto } : {}),
          },
        });
        await prisma.historicoPedido.create({
          data: { pedidoId: id, status: "AGUARDANDO_CANHOTO", usuario: `${nomeUsuario} (via importação de planilha)` },
        });
      }
      resultados.push({ linha: linha.linha, id, classificacao: "aguardando_canhoto" });
      continue;
    }

    // g) Nada disso — só atualiza o campo informativo.
    if (gravar) await atualizarSomenteStatusPlanilha(id, statusPlanilhaTexto);
    resultados.push({ linha: linha.linha, id, classificacao: "sem_mudanca_operacional" });
  }

  return resultados;
}

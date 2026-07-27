import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { LABEL_STATUS } from "@/lib/statusLabels";

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

// Identifica o tipo exato de cada mensagem "protegido"/"ignorado" — usado
// só pra decidir o que aparece na lista detalhada da importação (ver
// MOTIVOS_SUPRIMIDOS_DA_LISTA logo abaixo). O motivo em texto livre
// continua existindo pra exibição; isso aqui é uma chave estável, que não
// muda mesmo que o texto do motivo mude.
export type MotivoTipo =
  | "protegido_entregue"
  | "protegido_cancelado"
  | "protegido_entregue_apos_aceite"
  | "ignorado_campos_obrigatorios";

export type ResultadoLinhaImportacao =
  | { linha: number; id: string; classificacao: "novo" }
  | { linha: number; id: string; classificacao: "novo_aguardando_canhoto" }
  | { linha: number; id: string; classificacao: "novo_cancelado" }
  | { linha: number; id: string; classificacao: "novo_reentrega" }
  | { linha: number; id: string; classificacao: "reatribuido" }
  | { linha: number; id: string; classificacao: "reentrega_planilha" }
  | { linha: number; id: string; classificacao: "cancelado_planilha" }
  | { linha: number; id: string; classificacao: "aguardando_canhoto" }
  | { linha: number; id: string; classificacao: "protegido"; motivo: string; motivoTipo: MotivoTipo }
  | { linha: number; id: string; classificacao: "sem_mudanca_operacional" }
  | { linha: number; id: string | null; classificacao: "ignorado"; motivo: string; motivoTipo: MotivoTipo };

// Tipos de motivo que NÃO aparecem na lista detalhada da importação — são
// casos de comportamento esperado/protegido, não algo que precise de
// atenção. Continuam contados normalmente nos números do resumo (ver
// app/api/pedidos/importar/route.ts). Pra suprimir mais tipos no futuro,
// só adicionar a chave aqui.
export const MOTIVOS_SUPRIMIDOS_DA_LISTA: ReadonlySet<MotivoTipo> = new Set([
  "protegido_cancelado",
  "protegido_entregue_apos_aceite",
  "protegido_entregue",
]);

// Se um resultado deve aparecer na lista linha-a-linha do resumo de
// importação — resultados sem motivo (a maioria) sempre aparecem; os com
// motivo (protegido/ignorado) só aparecem se o tipo não estiver suprimido.
export function apareceNaListaDetalhada(r: ResultadoLinhaImportacao): boolean {
  if (r.classificacao === "protegido" || r.classificacao === "ignorado") {
    return !MOTIVOS_SUPRIMIDOS_DA_LISTA.has(r.motivoTipo);
  }
  return true;
}

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

// Monta o payload de reatribuição (volta pra Aguardando aceite com os
// dados novos da linha) sem gravar nada — quem chama decide se persiste
// (gravar=true) e sempre usa o retorno pra atualizar o estado simulado.
function montarReatribuicao(dados: ReturnType<typeof montarDados>, statusPlanilhaTexto: string | null) {
  return {
    ...dados,
    ...(statusPlanilhaTexto ? { statusPlanilha: statusPlanilhaTexto } : {}),
    statusEntrega: "AGUARDANDO_ACEITE" as const,
    statusFinanceiro: "NA" as const,
    dataEntrega: null,
    observacaoProblema: null,
    dataReentrega: null,
  };
}

// Classifica (e, se gravar=true, também executa) a importação em massa de
// pedidos. Roda em dois modos com a mesma lógica: modo prévia (gravar=false,
// só olha o banco e diz o que ia acontecer) e modo confirmação (gravar=true,
// aplica de verdade) — assim a prévia nunca fica dessincronizada da ação real.
//
// Pedidos NOVOS: sempre são criados, seja qual for o status que a planilha
// mostrar (Entregue → nasce "Aguardando canhoto"; Cancelado → nasce
// Cancelado; Reentrega → nasce "Reentrega"; qualquer outra coisa → nasce
// Aguardando aceite, como sempre).
//
// Pedidos que JÁ EXISTEM — prioridade nessa ordem, parando na primeira que valer:
//   a) ENTREGUE de verdade  → nunca mexe, protegido pra sempre.
//   b) CANCELADO            → nunca mexe, já está encerrado.
//   c) REENTREGA no sistema → planilha diz Cancelado → cancela; planilha diz
//      Reentrega → continua Reentrega (ainda não resolvido); qualquer outro
//      valor (inclusive em branco) → reatribui, volta pra "Aguardando
//      aceite" com os dados novos — nunca pula direto pra um status mais
//      avançado, sempre exige um novo aceite do transportador.
//   d) Planilha diz "Cancelado" → cancela o pedido no sistema.
//   e) Planilha diz "Reentrega" → pedido vira Reentrega (só a partir daqui,
//      numa linha seguinte, é que pode ser reatribuído — ver item c).
//   f) Planilha diz "Entregue" E status atual ainda é Aguardando aceite →
//      muda pra "Aguardando canhoto".
//   g) Planilha diz "Entregue" mas o status atual já passou de Aguardando
//      aceite → ignora, mantém o status atual.
//   h) Nada disso → não mexe no status operacional, só atualiza o campo
//      informativo (status reportado pela planilha).
//
// Linhas repetidas (mesmo Nº Pedido) no MESMO arquivo: processadas em ordem
// cronológica pela coluna DATA (não pela posição no arquivo) — cada uma
// como se fosse uma importação em um dia diferente, na sequência certa.
export async function processarImportacao(
  linhasOriginais: LinhaImportada[],
  nomeUsuario: string,
  gravar: boolean
): Promise<ResultadoLinhaImportacao[]> {
  const resultados: ResultadoLinhaImportacao[] = [];

  // Agrupa por Nº Pedido e ordena cada grupo por DATA crescente. Linhas
  // sem DATA suficiente pra comparar mantêm a ordem original entre si
  // (sort é estável). O grupo inteiro é processado na primeira posição em
  // que o id aparece no arquivo — não muda a ordem relativa entre ids
  // diferentes, só a ordem DENTRO de cada grupo de duplicatas.
  const gruposPorId = new Map<string, LinhaImportada[]>();
  for (const linha of linhasOriginais) {
    const id = String(linha.id ?? "").trim();
    if (!id) continue;
    if (!gruposPorId.has(id)) gruposPorId.set(id, []);
    gruposPorId.get(id)!.push(linha);
  }
  for (const grupo of gruposPorId.values()) {
    grupo.sort((a, b) => {
      const dataA = parseDataPrevista(a.dataPedido);
      const dataB = parseDataPrevista(b.dataPedido);
      if (!dataA || !dataB) return 0;
      return dataA.getTime() - dataB.getTime();
    });
  }
  const idsJaEnfileirados = new Set<string>();
  const linhas: LinhaImportada[] = [];
  for (const linha of linhasOriginais) {
    const id = String(linha.id ?? "").trim();
    if (!id) {
      linhas.push(linha); // sem id -> segue sozinha, cai no "ignorado" abaixo
      continue;
    }
    if (idsJaEnfileirados.has(id)) continue; // já enfileirado junto com o resto do grupo
    idsJaEnfileirados.add(id);
    linhas.push(...gruposPorId.get(id)!);
  }

  // Busca em UMA única consulta o estado atual de todos os pedidos que
  // aparecem nesta importação — em vez de uma consulta por linha. Esse era
  // o gargalo real de planilhas grandes: cada ida ao banco custa dezenas de
  // ms, e uma por linha em milhares de linhas estoura o tempo de execução
  // de uma função serverless da Vercel bem antes de estourar o tamanho da
  // requisição.
  const idsUnicos = [...new Set(linhas.map((l) => String(l.id ?? "").trim()).filter(Boolean))];
  const existentesNoBanco = idsUnicos.length > 0
    ? await prisma.pedido.findMany({ where: { id: { in: idsUnicos } } })
    : [];
  const estadoLocal = new Map<string, any>();
  for (const p of existentesNoBanco) estadoLocal.set(p.id, p);

  // Agora síncrono (só olha o mapa já carregado) — a segunda linha de uma
  // duplicata continua "vendo" o resultado da primeira, exatamente como
  // antes, só que sem precisar voltar ao banco pra isso.
  function buscarEstadoAtual(id: string) {
    return estadoLocal.get(id) ?? null;
  }
  function atualizarEstadoLocal(id: string, mudancas: Record<string, any>) {
    estadoLocal.set(id, { ...(estadoLocal.get(id) ?? {}), id, ...mudancas });
  }

  // Nada é gravado durante a classificação — as operações só ficam
  // acumuladas aqui, e são executadas em lote (createMany + transação) no
  // final, depois que toda a lógica (que não depende de I/O) já rodou.
  // dataCriacao/data do histórico são preenchidas explicitamente com um
  // contador crescente pra preservar a ordem original das linhas mesmo com
  // várias linhas ganhando o "agora" do banco ao mesmo tempo num createMany.
  const agora = Date.now();
  let sequencia = 0;
  function proximoInstante() {
    sequencia += 1;
    return new Date(agora + sequencia);
  }

  const paraCriar: any[] = [];
  // A esmagadora maioria das atualizações numa reimportação do dia a dia é
  // só isso: pedido já existe e nada operacional muda, só o texto
  // informativo da planilha é atualizado (protegido/sem-mudança). Como
  // updateMany não aceita valores diferentes por linha, mas TODAS essas
  // linhas mexem exatamente no mesmo único campo, elas vão pra um buffer
  // separado e são gravadas num UPDATE só (SQL bruto com VALUES), em vez de
  // uma chamada por linha — é essa gravação, não a criação, que domina o
  // tempo numa planilha operacional grande.
  const paraAtualizarSomenteStatusPlanilha: { id: string; statusPlanilha: string }[] = [];
  // Atualizações "de verdade" (reatribuição, cancelamento, reentrega,
  // aguardando canhoto) mexem em vários campos diferentes por linha — bem
  // mais raras numa reimportação do dia a dia, então continuam uma de cada
  // vez.
  const paraAtualizar: { id: string; data: Record<string, any> }[] = [];
  const historicos: { pedidoId: string; status: string; usuario: string; data: Date }[] = [];

  function planejarCriacao(id: string, data: Record<string, any>) {
    if (gravar) paraCriar.push({ id, dataCriacao: proximoInstante(), ...data });
  }
  function planejarAtualizacao(id: string, data: Record<string, any>) {
    if (!gravar || Object.keys(data).length === 0) return;
    const chaves = Object.keys(data);
    if (chaves.length === 1 && chaves[0] === "statusPlanilha") {
      paraAtualizarSomenteStatusPlanilha.push({ id, statusPlanilha: data.statusPlanilha });
    } else {
      paraAtualizar.push({ id, data });
    }
  }
  function planejarHistorico(pedidoId: string, status: string, usuario: string) {
    if (gravar) historicos.push({ pedidoId, status, usuario, data: proximoInstante() });
  }

  for (const linha of linhas) {
    const id = String(linha.id ?? "").trim();
    const cliente = String(linha.cliente ?? "").trim();
    const transportador = String(linha.transportador ?? "").trim();

    if (!id || !cliente || !transportador) {
      resultados.push({
        linha: linha.linha,
        id: id || null,
        classificacao: "ignorado",
        motivo: "Preencha nº do pedido, cliente e transportador",
        motivoTipo: "ignorado_campos_obrigatorios",
      });
      continue;
    }

    const statusPlanilha = interpretarStatusPlanilha(linha.statusEntregaPlanilha);
    const statusPlanilhaTexto = textoStatusPlanilha(linha.statusEntregaPlanilha);
    const dados = montarDados(linha, cliente, transportador);
    const dadosComInformativo = { ...dados, ...(statusPlanilhaTexto ? { statusPlanilha: statusPlanilhaTexto } : {}) };
    const existente = buscarEstadoAtual(id);

    if (!existente) {
      if (statusPlanilha === "CANCELADO") {
        const novoEstado = { ...dadosComInformativo, statusEntrega: "CANCELADO" as const, statusFinanceiro: "NA" as const };
        planejarCriacao(id, novoEstado);
        planejarHistorico(id, "CANCELADO", `${nomeUsuario} (via importação de planilha)`);
        atualizarEstadoLocal(id, novoEstado);
        resultados.push({ linha: linha.linha, id, classificacao: "novo_cancelado" });
        continue;
      }
      if (statusPlanilha === "ENTREGUE") {
        const novoEstado = { ...dadosComInformativo, statusEntrega: "AGUARDANDO_CANHOTO" as const, statusFinanceiro: "NA" as const };
        planejarCriacao(id, novoEstado);
        planejarHistorico(id, "AGUARDANDO_CANHOTO", `${nomeUsuario} (via importação de planilha)`);
        atualizarEstadoLocal(id, novoEstado);
        resultados.push({ linha: linha.linha, id, classificacao: "novo_aguardando_canhoto" });
        continue;
      }
      if (statusPlanilha === "REENTREGA") {
        const novoEstado = { ...dadosComInformativo, statusEntrega: "REENTREGA" as const, statusFinanceiro: "NA" as const, dataReentrega: new Date() };
        planejarCriacao(id, novoEstado);
        planejarHistorico(id, "REENTREGA", `${nomeUsuario} (via importação de planilha)`);
        atualizarEstadoLocal(id, novoEstado);
        resultados.push({ linha: linha.linha, id, classificacao: "novo_reentrega" });
        continue;
      }
      const novoEstado = { ...dadosComInformativo, statusEntrega: "AGUARDANDO_ACEITE" as const, statusFinanceiro: "NA" as const };
      planejarCriacao(id, novoEstado);
      planejarHistorico(id, "AGUARDANDO_ACEITE", nomeUsuario);
      atualizarEstadoLocal(id, novoEstado);
      resultados.push({ linha: linha.linha, id, classificacao: "novo" });
      continue;
    }

    // a) Entregue de verdade — protegido pra sempre.
    if (existente.statusEntrega === "ENTREGUE") {
      if (statusPlanilhaTexto) planejarAtualizacao(id, { statusPlanilha: statusPlanilhaTexto });
      atualizarEstadoLocal(id, statusPlanilhaTexto ? { statusPlanilha: statusPlanilhaTexto } : {});
      resultados.push({
        linha: linha.linha,
        id,
        classificacao: "protegido",
        motivo: "Pedido já está Entregue — protegido contra alterações da importação",
        motivoTipo: "protegido_entregue",
      });
      continue;
    }

    // b) Cancelado já está encerrado.
    if (existente.statusEntrega === "CANCELADO") {
      if (statusPlanilhaTexto) planejarAtualizacao(id, { statusPlanilha: statusPlanilhaTexto });
      atualizarEstadoLocal(id, statusPlanilhaTexto ? { statusPlanilha: statusPlanilhaTexto } : {});
      resultados.push({
        linha: linha.linha,
        id,
        classificacao: "protegido",
        motivo: "Pedido já está Cancelado — não é alterado",
        motivoTipo: "protegido_cancelado",
      });
      continue;
    }

    // c) Já está em Reentrega — regra específica: só Cancelado ou Reentrega
    // (mantém) da planilha não reatribuem; qualquer outro valor reatribui
    // e sempre exige um novo aceite (nunca pula direto pra um status mais
    // avançado como "Em rota" só porque a planilha diz isso).
    if (existente.statusEntrega === "REENTREGA") {
      if (statusPlanilha === "CANCELADO") {
        const novoEstado = {
          statusEntrega: "CANCELADO" as const,
          observacaoProblema: "Cancelado via importação de planilha",
          dataReentrega: null,
          ...(statusPlanilhaTexto ? { statusPlanilha: statusPlanilhaTexto } : {}),
        };
        planejarAtualizacao(id, novoEstado);
        planejarHistorico(id, "CANCELADO", `${nomeUsuario} (via importação de planilha)`);
        atualizarEstadoLocal(id, novoEstado);
        resultados.push({ linha: linha.linha, id, classificacao: "cancelado_planilha" });
        continue;
      }
      if (statusPlanilha === "REENTREGA") {
        if (statusPlanilhaTexto) planejarAtualizacao(id, { statusPlanilha: statusPlanilhaTexto });
        atualizarEstadoLocal(id, statusPlanilhaTexto ? { statusPlanilha: statusPlanilhaTexto } : {});
        resultados.push({ linha: linha.linha, id, classificacao: "sem_mudanca_operacional" });
        continue;
      }
      // qualquer outro valor (Em rota, Entregue, Aguardando carregamento, em
      // branco etc.) — reatribui com os dados novos, sempre volta pra
      // Aguardando aceite.
      const novoEstado = montarReatribuicao(dados, statusPlanilhaTexto);
      planejarAtualizacao(id, novoEstado);
      planejarHistorico(
        id,
        "AGUARDANDO_ACEITE",
        `${nomeUsuario} (reatribuído de ${existente.transportador} para ${novoEstado.transportador})`
      );
      atualizarEstadoLocal(id, novoEstado);
      resultados.push({ linha: linha.linha, id, classificacao: "reatribuido" });
      continue;
    }

    // d) Planilha avisa de um cancelamento novo.
    if (statusPlanilha === "CANCELADO") {
      const novoEstado = {
        statusEntrega: "CANCELADO" as const,
        observacaoProblema: "Cancelado via importação de planilha",
        ...(statusPlanilhaTexto ? { statusPlanilha: statusPlanilhaTexto } : {}),
      };
      planejarAtualizacao(id, novoEstado);
      planejarHistorico(id, "CANCELADO", `${nomeUsuario} (via importação de planilha)`);
      atualizarEstadoLocal(id, novoEstado);
      resultados.push({ linha: linha.linha, id, classificacao: "cancelado_planilha" });
      continue;
    }

    // e) Planilha diz "Reentrega" e o pedido ainda não estava em Reentrega
    // — vira Reentrega agora (a reatribuição em si só acontece depois,
    // numa linha seguinte, via item c).
    if (statusPlanilha === "REENTREGA") {
      const novoEstado = {
        statusEntrega: "REENTREGA" as const,
        observacaoProblema: "Reentrega reportada via importação de planilha",
        dataReentrega: new Date(),
        ...(statusPlanilhaTexto ? { statusPlanilha: statusPlanilhaTexto } : {}),
      };
      planejarAtualizacao(id, novoEstado);
      planejarHistorico(id, "REENTREGA", `${nomeUsuario} (via importação de planilha)`);
      atualizarEstadoLocal(id, novoEstado);
      resultados.push({ linha: linha.linha, id, classificacao: "reentrega_planilha" });
      continue;
    }

    // f) Planilha diz "Entregue" — só vale se ninguém ainda deu aceite no
    // site (status atual ainda é Aguardando aceite). Uma vez aceito, o
    // sinal "Entregue" da planilha não pode mais pular o fluxo real de
    // entrega (canhoto) — isso é decidido em g) logo abaixo.
    if (statusPlanilha === "ENTREGUE" && existente.statusEntrega === "AGUARDANDO_ACEITE") {
      const novoEstado = {
        statusEntrega: "AGUARDANDO_CANHOTO" as const,
        ...(statusPlanilhaTexto ? { statusPlanilha: statusPlanilhaTexto } : {}),
      };
      planejarAtualizacao(id, novoEstado);
      planejarHistorico(id, "AGUARDANDO_CANHOTO", `${nomeUsuario} (via importação de planilha)`);
      atualizarEstadoLocal(id, novoEstado);
      resultados.push({ linha: linha.linha, id, classificacao: "aguardando_canhoto" });
      continue;
    }

    // g) Planilha diz "Entregue", mas o pedido já saiu de Aguardando aceite
    // no site (alguém já deu aceite) — ignora o sinal da planilha e mantém
    // o status atual, só atualizando o campo informativo.
    if (statusPlanilha === "ENTREGUE") {
      if (statusPlanilhaTexto) planejarAtualizacao(id, { statusPlanilha: statusPlanilhaTexto });
      atualizarEstadoLocal(id, statusPlanilhaTexto ? { statusPlanilha: statusPlanilhaTexto } : {});
      resultados.push({
        linha: linha.linha,
        id,
        classificacao: "protegido",
        motivo: `Pedido já foi aceito no site (status atual: ${LABEL_STATUS[existente.statusEntrega] ?? existente.statusEntrega}) — sinal de "Entregue" da planilha ignorado`,
        motivoTipo: "protegido_entregue_apos_aceite",
      });
      continue;
    }

    // h) Nada disso — só atualiza o campo informativo.
    if (statusPlanilhaTexto) planejarAtualizacao(id, { statusPlanilha: statusPlanilhaTexto });
    atualizarEstadoLocal(id, statusPlanilhaTexto ? { statusPlanilha: statusPlanilhaTexto } : {});
    resultados.push({ linha: linha.linha, id, classificacao: "sem_mudanca_operacional" });
  }

  // Executa tudo em lote — createMany pros pedidos novos, não importa
  // quantos, é uma única ida ao banco; o mesmo vale pro histórico. As
  // atualizações (dados diferentes linha a linha, não dá pra usar
  // updateMany) continuam uma de cada vez, mas já sem a leitura prévia por
  // linha (essa parte já foi resolvida pelo findMany em lote acima).
  //
  // Importante: NÃO envolve tudo isso numa transação interativa
  // (`$transaction(async (tx) => ...)`) — o banco (Neon) é acessado por uma
  // conexão com pooler (pgbouncer), que pode trocar a conexão física entre
  // uma instrução e outra. Numa transação interativa longa (muitas
  // atualizações em sequência), isso derruba a transação no meio com
  // "Transaction not found" — foi exatamente o erro que apareceu num lote
  // com muitas atualizações. Sem a transação, cada operação é independente
  // e não depende de manter a mesma conexão do início ao fim; se uma falhar
  // no meio, reimportar a mesma planilha continua seguro (nada duplica,
  // graças à checagem por nº de pedido).
  if (gravar) {
    if (paraCriar.length > 0) {
      await prisma.pedido.createMany({ data: paraCriar });
    }
    // Atualizações "só o texto informativo" — o caso mais comum de longe
    // numa reimportação do dia a dia — todas de uma vez, num UPDATE só via
    // SQL bruto (UPDATE ... FROM (VALUES ...)), que aceita um valor
    // diferente por linha numa única ida ao banco. É isso que evita voltar
    // a esbarrar no limite de tempo quando a maioria das 7 mil e tantas
    // linhas já existe e só precisa desse toque.
    if (paraAtualizarSomenteStatusPlanilha.length > 0) {
      const valores = Prisma.join(
        paraAtualizarSomenteStatusPlanilha.map(
          (op) => Prisma.sql`(${op.id}::text, ${op.statusPlanilha}::text)`
        ),
        ", "
      );
      await prisma.$executeRaw`
        UPDATE "Pedido" AS p
        SET "statusPlanilha" = v.status_planilha
        FROM (VALUES ${valores}) AS v(id, status_planilha)
        WHERE p.id = v.id
      `;
    }
    // Atualizações "de verdade" (campos diferentes por linha) — bem mais
    // raras, continuam uma de cada vez.
    for (const op of paraAtualizar) {
      await prisma.pedido.update({ where: { id: op.id }, data: op.data });
    }
    if (historicos.length > 0) {
      await prisma.historicoPedido.createMany({ data: historicos });
    }
  }

  return resultados;
}

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

// Reconhece o texto solto que veio na coluna opcional "Status de entrega" da
// planilha. A ordem dos "includes" importa: "reentrega" contém a substring
// "entreg", então precisa ser testada antes.
function interpretarStatusPlanilha(valorCru: unknown): "ENTREGUE" | "CANCELADO" | "REENTREGA" | null {
  const texto = String(valorCru ?? "")
    .normalize("NFD")
    .replace(new RegExp(String.fromCharCode(0x5b) + "\\u0300-\\u036f" + String.fromCharCode(0x5d), "g"), "")
    .toLowerCase()
    .trim();
  if (!texto) return null;
  if (texto.includes("reentreg")) return "REENTREGA";
  if (texto.includes("cancel")) return "CANCELADO";
  if (texto.includes("entreg")) return "ENTREGUE";
  return null;
}

export type LinhaImportada = LinhaPedido & {
  linha: number; // número da linha na planilha original, só pra reportar erro/motivo
  statusEntregaPlanilha?: unknown; // valor cru da coluna opcional "Status de entrega"
};

export type ResultadoLinhaImportacao =
  | { linha: number; id: string; classificacao: "novo" }
  | { linha: number; id: string; classificacao: "reatribuido" }
  | { linha: number; id: string; classificacao: "cancelado_planilha" }
  | { linha: number; id: string | null; classificacao: "ignorado"; motivo: string };

async function reatribuirPedido(id: string, dados: ReturnType<typeof montarDados>, transportadorAnterior: string, nomeUsuario: string) {
  await prisma.pedido.update({
    where: { id },
    data: { ...dados, statusEntrega: "AGUARDANDO_ACEITE", statusFinanceiro: "NA", dataEntrega: null, observacaoProblema: null },
  });
  await prisma.historicoPedido.create({
    data: {
      pedidoId: id,
      status: "AGUARDANDO_ACEITE",
      usuario: `${nomeUsuario} (reatribuído de ${transportadorAnterior} para ${dados.transportador})`,
    },
  });
}

function montarDados(linha: LinhaImportada, cliente: string, transportador: string) {
  return {
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
}

// Classifica (e, se gravar=true, também executa) a importação em massa de
// pedidos. Roda em dois modos com a mesma lógica: modo prévia (gravar=false,
// só olha o banco e diz o que ia acontecer) e modo confirmação (gravar=true,
// aplica de verdade) — assim a prévia nunca fica dessincronizada da ação real.
//
// Prioridade das regras para um pedido que já existe no banco (nessa ordem):
//   1. Já está ENTREGUE  → nunca mexe, protegido pra sempre.
//   2. Já está CANCELADO → nunca mexe, já está encerrado.
//   3. Já está REENTREGA (ou a planilha diz "Reentrega") → reatribui, volta
//      pra "Aguardando aceite" com os dados novos da linha.
//   4. Planilha diz "Cancelado" → cancela o pedido no sistema.
//   5. Nada disso → ignora, não faz nada (não é erro).
export async function processarImportacao(
  linhas: LinhaImportada[],
  nomeUsuario: string,
  gravar: boolean
): Promise<ResultadoLinhaImportacao[]> {
  const resultados: ResultadoLinhaImportacao[] = [];

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
      });
      continue;
    }

    const statusPlanilha = interpretarStatusPlanilha(linha.statusEntregaPlanilha);
    const dados = montarDados(linha, cliente, transportador);
    const existente = await prisma.pedido.findUnique({ where: { id } });

    if (!existente) {
      // Pedido novo — se a planilha já traz ele como finalizado, não cria
      // (evita importar pedidos antigos já resolvidos de uma planilha completa).
      if (statusPlanilha === "ENTREGUE" || statusPlanilha === "CANCELADO") {
        resultados.push({
          linha: linha.linha,
          id,
          classificacao: "ignorado",
          motivo: `Pedido novo, mas a planilha já traz como "${statusPlanilha === "ENTREGUE" ? "Entregue" : "Cancelado"}" — não foi criado`,
        });
        continue;
      }
      if (gravar) {
        await prisma.pedido.create({
          data: { id, ...dados, statusEntrega: "AGUARDANDO_ACEITE", statusFinanceiro: "NA" },
        });
        await prisma.historicoPedido.create({
          data: { pedidoId: id, status: "AGUARDANDO_ACEITE", usuario: nomeUsuario },
        });
      }
      resultados.push({ linha: linha.linha, id, classificacao: "novo" });
      continue;
    }

    // 1. Entregue é definitivo — nunca sobrescrever.
    if (existente.statusEntrega === "ENTREGUE") {
      resultados.push({
        linha: linha.linha,
        id,
        classificacao: "ignorado",
        motivo: "Pedido já está Entregue — protegido contra alterações da importação",
      });
      continue;
    }

    // 2. Cancelado já está encerrado.
    if (existente.statusEntrega === "CANCELADO") {
      resultados.push({
        linha: linha.linha,
        id,
        classificacao: "ignorado",
        motivo: "Pedido já está Cancelado — não é alterado",
      });
      continue;
    }

    // 3. Reentrega (no nosso sistema, ou apontada agora pela planilha) → reatribui.
    if (existente.statusEntrega === "REENTREGA" || statusPlanilha === "REENTREGA") {
      if (gravar) await reatribuirPedido(id, dados, existente.transportador, nomeUsuario);
      resultados.push({ linha: linha.linha, id, classificacao: "reatribuido" });
      continue;
    }

    // 4. Planilha avisa de um cancelamento novo.
    if (statusPlanilha === "CANCELADO") {
      if (gravar) {
        await prisma.pedido.update({
          where: { id },
          data: { statusEntrega: "CANCELADO", observacaoProblema: "Cancelado via importação de planilha" },
        });
        await prisma.historicoPedido.create({
          data: { pedidoId: id, status: "CANCELADO", usuario: `${nomeUsuario} (via importação de planilha)` },
        });
      }
      resultados.push({ linha: linha.linha, id, classificacao: "cancelado_planilha" });
      continue;
    }

    // 5. Nada relevante mudou.
    resultados.push({
      linha: linha.linha,
      id,
      classificacao: "ignorado",
      motivo: "Pedido já existe e nada relevante mudou",
    });
  }

  return resultados;
}

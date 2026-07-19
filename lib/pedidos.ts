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

const LABEL_STATUS: Record<string, string> = {
  AGUARDANDO_ACEITE: "Aguardando aceite",
  AGUARDANDO_CARREGAMENTO: "Aguardando carregamento",
  EM_ROTA: "Em rota de entrega",
  ENTREGUE: "Entregue",
  REENTREGA: "Reentrega",
  CANCELADO: "Cancelado",
  DEVOLVIDO: "Devolvido",
};

// Reconhece se o texto solto que veio na coluna opcional "Status de entrega"
// da planilha já indica um pedido finalizado — nesse caso não importamos,
// pra não inundar o sistema de histórico antigo se alguém subir a planilha
// completa (com pedidos já entregues há meses, por exemplo).
function statusPlanilhaIndicaFinalizado(valorCru: unknown): "ENTREGUE" | "CANCELADO" | null {
  const texto = String(valorCru ?? "")
    .normalize("NFD")
    .replace(new RegExp(String.fromCharCode(0x5b) + "\\u0300-\\u036f" + String.fromCharCode(0x5d), "g"), "")
    .toLowerCase()
    .trim();
  if (!texto) return null;
  if (texto.includes("entreg")) return "ENTREGUE";
  if (texto.includes("cancel")) return "CANCELADO";
  return null;
}

export type LinhaImportada = LinhaPedido & {
  linha: number; // número da linha na planilha original, só pra reportar erro/motivo
  statusEntregaPlanilha?: unknown; // valor cru da coluna opcional "Status de entrega"
};

export type ResultadoLinhaImportacao =
  | { linha: number; id: string; classificacao: "novo" }
  | { linha: number; id: string; classificacao: "reatribuido" }
  | { linha: number; id: string | null; classificacao: "ignorado"; motivo: string };

// Classifica (e, se gravar=true, também executa) a importação em massa de
// pedidos. Roda em dois modos com a mesma lógica: modo prévia (gravar=false,
// só olha o banco e diz o que ia acontecer) e modo confirmação (gravar=true,
// aplica de verdade) — assim a prévia nunca fica dessincronizada da ação real.
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

    const statusFinalizado = statusPlanilhaIndicaFinalizado(linha.statusEntregaPlanilha);
    if (statusFinalizado) {
      resultados.push({
        linha: linha.linha,
        id,
        classificacao: "ignorado",
        motivo: `A planilha já traz esse pedido como "${statusFinalizado === "ENTREGUE" ? "Entregue" : "Cancelado"}"`,
      });
      continue;
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

    if (existente.statusEntrega !== "REENTREGA") {
      resultados.push({
        linha: linha.linha,
        id,
        classificacao: "ignorado",
        motivo: `Pedido já existe com status "${LABEL_STATUS[existente.statusEntrega] ?? existente.statusEntrega}" (só reentrega é atualizada)`,
      });
      continue;
    }

    if (gravar) {
      await prisma.pedido.update({
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
    }
    resultados.push({ linha: linha.linha, id, classificacao: "reatribuido" });
  }

  return resultados;
}

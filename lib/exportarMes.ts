import * as XLSX from "xlsx";
import JSZip from "jszip";
import { prisma } from "@/lib/db";

// Mesmo critério de "mês do pedido" usado no painel de armazenamento: data
// prevista de entrega quando existe, senão data de criação.
function chaveDoMes(dataPrevista: Date | null, dataCriacao: Date): string {
  const d = new Date(dataPrevista ?? dataCriacao);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function pedidosDoMes(mes: string) {
  const todos = await prisma.pedido.findMany({
    include: { historico: { orderBy: { data: "asc" } } },
    orderBy: { id: "asc" },
  });
  return todos.filter((p) => chaveDoMes(p.dataPrevistaEntrega, p.dataCriacao) === mes);
}

const LABEL_STATUS_ENTREGA: Record<string, string> = {
  AGUARDANDO_ACEITE: "Aguardando aceite",
  AGUARDANDO_CARREGAMENTO: "Aguardando carregamento",
  EM_ROTA: "Em rota de entrega",
  AGUARDANDO_CANHOTO: "Entregue (planilha) — aguardando canhoto",
  ENTREGUE: "Entregue",
  REENTREGA: "Reentrega",
  CANCELADO: "Cancelado",
  DEVOLVIDO: "Devolvido",
};

function extensaoDaUrl(url: string, fallback: string): string {
  const semQuery = url.split("?")[0];
  const match = semQuery.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1] : fallback;
}

// Gera o .xlsx com uma aba "Pedidos" (todas as colunas) e uma aba
// "Historico" (uma linha por evento de cada pedido).
function gerarPlanilha(pedidos: Awaited<ReturnType<typeof pedidosDoMes>>): Buffer {
  const linhasPedidos = pedidos.map((p) => ({
    "Nº Pedido": p.id,
    Cliente: p.cliente,
    Cidade: p.cidade,
    Bairro: p.bairro,
    Rua: p.rua,
    Número: p.numero,
    Transportador: p.transportador,
    Operação: p.operacao,
    "Forma de Pagamento": p.formaPagamento,
    Valor: Number(p.valorPedido),
    Prazo: p.prazo,
    "Data Prevista de Entrega": p.dataPrevistaEntrega ? p.dataPrevistaEntrega.toISOString().slice(0, 10) : "",
    "Status de Entrega": LABEL_STATUS_ENTREGA[p.statusEntrega] ?? p.statusEntrega,
    "Status na Planilha": p.statusPlanilha ?? "",
    "Status Financeiro": p.statusFinanceiro,
    Observação: p.observacaoProblema ?? "",
    "Canhoto (URL)": p.canhotoUrl ?? "",
    "Comprovante de Pagamento (URL)": p.comprovantePagamentoUrl ?? "",
    "Data de Criação": p.dataCriacao.toISOString(),
    "Data de Entrega": p.dataEntrega ? p.dataEntrega.toISOString() : "",
    "Acerto Confirmado Em": p.acertoConfirmadoEm ? p.acertoConfirmadoEm.toISOString() : "",
  }));

  const linhasHistorico = pedidos.flatMap((p) =>
    p.historico.map((h) => ({
      "Nº Pedido": p.id,
      Status: h.status,
      Usuário: h.usuario,
      Data: h.data.toISOString(),
    }))
  );

  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, XLSX.utils.json_to_sheet(linhasPedidos), "Pedidos");
  XLSX.utils.book_append_sheet(livro, XLSX.utils.json_to_sheet(linhasHistorico), "Historico");
  return XLSX.write(livro, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export async function gerarZipDoMes(mes: string, nomeUsuario: string) {
  const pedidos = await pedidosDoMes(mes);
  const zip = new JSZip();

  zip.file(`pedidos_${mes}.xlsx`, gerarPlanilha(pedidos));

  const pastaCanhotos = zip.folder("canhotos")!;
  const pastaComprovantes = zip.folder("comprovantes")!;
  let totalCanhotos = 0;
  let totalComprovantes = 0;

  for (const p of pedidos) {
    if (p.canhotoUrl) {
      try {
        const resp = await fetch(p.canhotoUrl);
        if (resp.ok) {
          const buffer = Buffer.from(await resp.arrayBuffer());
          const ext = extensaoDaUrl(p.canhotoUrl, p.canhotoTipo === "pdf" ? "pdf" : "jpg");
          pastaCanhotos.file(`canhoto_${p.id}.${ext}`, buffer);
          totalCanhotos++;
        }
      } catch {
        // Arquivo pode ter sumido do Blob por algum motivo — não trava a exportação inteira por isso.
      }
    }
    if (p.comprovantePagamentoUrl) {
      try {
        const resp = await fetch(p.comprovantePagamentoUrl);
        if (resp.ok) {
          const buffer = Buffer.from(await resp.arrayBuffer());
          const ext = extensaoDaUrl(p.comprovantePagamentoUrl, p.comprovantePagamentoTipo === "pdf" ? "pdf" : "jpg");
          pastaComprovantes.file(`comprovante_${p.id}.${ext}`, buffer);
          totalComprovantes++;
        }
      } catch {
        // idem
      }
    }
  }

  const agora = new Date();
  const readme = [
    `Exportação de pedidos — Stier Controle de Entregas`,
    ``,
    `Período: ${mes}`,
    `Gerado em: ${agora.toLocaleString("pt-BR")} por ${nomeUsuario}`,
    ``,
    `Conteúdo deste arquivo:`,
    `- ${pedidos.length} pedido(s) na planilha pedidos_${mes}.xlsx (aba "Pedidos" com todos os dados, aba "Historico" com o histórico de status de cada um)`,
    `- ${totalCanhotos} foto(s)/arquivo(s) de canhoto na pasta canhotos/`,
    `- ${totalComprovantes} foto(s)/arquivo(s) de comprovante de pagamento na pasta comprovantes/`,
    ``,
    `Guarde este arquivo em pelo menos dois lugares (ex: computador + nuvem) antes de excluir os dados originais do sistema.`,
  ].join("\n");
  zip.file("LEIA-ME.txt", readme);

  const buffer = (await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })) as Buffer;

  return {
    buffer,
    totalPedidos: pedidos.length,
    totalArquivos: totalCanhotos + totalComprovantes,
  };
}

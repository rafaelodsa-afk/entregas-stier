import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, COOKIE_NAME, podeVerTudo } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ehPagamentoAVista, ehOperacaoDeVenda } from "@/lib/pedidos";
import FiltroTransportador from "@/components/FiltroTransportador";
import FinanceiroTabela from "@/components/FinanceiroTabela";
import FinanceiroHistorico from "@/components/FinanceiroHistorico";
import FinanceiroPrevisto from "@/components/FinanceiroPrevisto";

export const dynamic = "force-dynamic";

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: { transportador?: string };
}) {
  const token = cookies().get(COOKIE_NAME)?.value;
  const sessao = token ? await verifySession(token) : null;
  if (!sessao || !podeVerTudo(sessao.papel)) redirect("/dashboard");

  const todosPedidos = await prisma.pedido.findMany();
  const transportadores = [...new Set(todosPedidos.map((p) => p.transportador))].sort();

  const filtroTransportador = searchParams.transportador ?? "";

  // Visão antecipada: pedidos já aceitos (ou em rota, ou entregues pela
  // planilha mas sem canhoto real ainda) que VÃO virar pendência financeira
  // quando forem entregues de verdade — só pra planejamento, não mexe no
  // statusFinanceiro real do pedido.
  const candidatosPrevisto = await prisma.pedido.findMany({
    where: {
      statusEntrega: { in: ["AGUARDANDO_CARREGAMENTO", "EM_ROTA", "AGUARDANDO_CANHOTO"] },
      ...(filtroTransportador ? { transportador: filtroTransportador } : {}),
    },
    orderBy: { dataCriacao: "asc" },
  });
  const previstos = candidatosPrevisto.filter((p) => ehOperacaoDeVenda(p.operacao) && ehPagamentoAVista(p.formaPagamento));

  const aguardandoAcerto = await prisma.pedido.findMany({
    where: { statusFinanceiro: "AGUARDANDO_ACERTO", ...(filtroTransportador ? { transportador: filtroTransportador } : {}) },
    orderBy: { dataEntrega: "asc" },
  });

  const historico = await prisma.pedido.findMany({
    where: { statusFinanceiro: "PAGO", ...(filtroTransportador ? { transportador: filtroTransportador } : {}) },
    orderBy: { acertoConfirmadoEm: "desc" },
    take: 50,
  });

  return (
    <div>
      <h1 className="page-title">Financeiro</h1>
      <p className="page-sub">Pedidos aguardando acerto (pagamento em dinheiro ou PIX já entregues) e histórico do que já foi recebido.</p>

      <div className="filtros-topo">
        <FiltroTransportador transportadores={transportadores} />
      </div>

      <h2 style={{ marginBottom: 12 }}>Previsto — ainda não entregue</h2>
      <FinanceiroPrevisto
        pedidos={previstos.map((p) => ({
          id: p.id,
          cliente: p.cliente,
          transportador: p.transportador,
          formaPagamento: p.formaPagamento,
          statusEntrega: p.statusEntrega,
          valorPedido: Number(p.valorPedido),
        }))}
      />

      <h2 style={{ marginTop: 28, marginBottom: 12 }}>Aguardando acerto</h2>
      <FinanceiroTabela
        pedidos={aguardandoAcerto.map((p) => ({
          id: p.id,
          cliente: p.cliente,
          transportador: p.transportador,
          formaPagamento: p.formaPagamento,
          valorPedido: Number(p.valorPedido),
          dataEntrega: p.dataEntrega,
          comprovantePagamentoUrl: p.comprovantePagamentoUrl,
        }))}
      />

      <h2 style={{ marginTop: 28, marginBottom: 12 }}>Histórico de acertos recebidos</h2>
      <FinanceiroHistorico
        pedidos={historico.map((p) => ({
          id: p.id,
          cliente: p.cliente,
          transportador: p.transportador,
          valorPedido: Number(p.valorPedido),
          acertoConfirmadoEm: p.acertoConfirmadoEm,
          comprovantePagamentoUrl: p.comprovantePagamentoUrl,
        }))}
      />
    </div>
  );
}

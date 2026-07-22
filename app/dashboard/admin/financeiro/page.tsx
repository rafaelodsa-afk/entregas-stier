import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, COOKIE_NAME, podeVerTudo } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ehPagamentoAVista, ehOperacaoDeVenda } from "@/lib/pedidos";
import { comLinksAssinados } from "@/lib/r2";
import PainelFinanceiro from "@/components/PainelFinanceiro";

export const dynamic = "force-dynamic";

export default async function FinanceiroPage() {
  const token = cookies().get(COOKIE_NAME)?.value;
  const sessao = token ? await verifySession(token) : null;
  if (!sessao || !podeVerTudo(sessao.papel)) redirect("/dashboard");

  // Sem filtro de transportador aqui no servidor — os filtros (transportador,
  // status financeiro, período) agora são todos aplicados no navegador, pelo
  // PainelFinanceiro, pra poder combinar vários ao mesmo tempo sem recarregar
  // a página a cada clique.
  const [transportadoresRaw, candidatosPrevisto, aguardandoAcerto, historico] = await Promise.all([
    prisma.pedido.findMany({ select: { transportador: true }, distinct: ["transportador"] }),
    prisma.pedido.findMany({
      where: { statusEntrega: { in: ["AGUARDANDO_CARREGAMENTO", "EM_ROTA", "AGUARDANDO_CANHOTO"] } },
      orderBy: { dataCriacao: "asc" },
      select: { id: true, cliente: true, transportador: true, formaPagamento: true, statusEntrega: true, valorPedido: true, operacao: true, dataPedido: true },
    }),
    prisma.pedido.findMany({
      where: { statusFinanceiro: "AGUARDANDO_ACERTO" },
      orderBy: { dataEntrega: "asc" },
      select: { id: true, cliente: true, transportador: true, formaPagamento: true, valorPedido: true, dataPedido: true, dataEntrega: true, comprovantePagamentoUrl: true },
    }),
    prisma.pedido.findMany({
      where: { statusFinanceiro: "PAGO" },
      orderBy: { acertoConfirmadoEm: "desc" },
      take: 200,
      select: { id: true, cliente: true, transportador: true, valorPedido: true, dataPedido: true, acertoConfirmadoEm: true, comprovantePagamentoUrl: true },
    }),
  ]);

  const transportadores = [...new Set(transportadoresRaw.map((p) => p.transportador))].sort();
  const previstos = candidatosPrevisto.filter((p) => ehOperacaoDeVenda(p.operacao) && ehPagamentoAVista(p.formaPagamento));

  const [aguardandoAcertoComLinks, historicoComLinks] = await Promise.all([
    Promise.all(aguardandoAcerto.map(comLinksAssinados)),
    Promise.all(historico.map(comLinksAssinados)),
  ]);

  return (
    <div>
      <h1 className="page-title">Financeiro</h1>
      <p className="page-sub">Pedidos aguardando acerto (pagamento em dinheiro ou PIX já entregues) e histórico do que já foi recebido.</p>

      <PainelFinanceiro
        transportadores={transportadores}
        previstos={previstos.map((p) => ({
          id: p.id,
          cliente: p.cliente,
          transportador: p.transportador,
          formaPagamento: p.formaPagamento,
          statusEntrega: p.statusEntrega,
          valorPedido: Number(p.valorPedido),
          dataPedido: p.dataPedido,
        }))}
        aguardandoAcerto={aguardandoAcertoComLinks.map((p) => ({
          id: p.id,
          cliente: p.cliente,
          transportador: p.transportador,
          formaPagamento: p.formaPagamento,
          valorPedido: Number(p.valorPedido),
          dataPedido: p.dataPedido,
          dataEntrega: p.dataEntrega,
          comprovantePagamentoUrl: p.comprovantePagamentoUrl,
        }))}
        historico={historicoComLinks.map((p) => ({
          id: p.id,
          cliente: p.cliente,
          transportador: p.transportador,
          valorPedido: Number(p.valorPedido),
          dataPedido: p.dataPedido,
          acertoConfirmadoEm: p.acertoConfirmadoEm,
          comprovantePagamentoUrl: p.comprovantePagamentoUrl,
        }))}
      />
    </div>
  );
}

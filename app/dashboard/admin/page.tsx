import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, COOKIE_NAME, podeVerTudo } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { comLinksAssinados } from "@/lib/r2";
import ImportarPlanilha from "@/components/ImportarPlanilha";
import CriarPedido from "@/components/CriarPedido";
import FiltroTransportador from "@/components/FiltroTransportador";
import TabelaPedidos from "@/components/TabelaPedidos";

export const dynamic = "force-dynamic";

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: { transportador?: string };
}) {
  const token = cookies().get(COOKIE_NAME)?.value;
  const sessao = token ? await verifySession(token) : null;
  if (!sessao || !podeVerTudo(sessao.papel)) redirect("/login");

  const todosPedidos = await prisma.pedido.findMany({ orderBy: { dataCriacao: "desc" } });
  const transportadores = [...new Set(todosPedidos.map((p) => p.transportador))].sort();

  const filtroTransportador = searchParams.transportador ?? "";
  const pedidos = filtroTransportador
    ? todosPedidos.filter((p) => p.transportador === filtroTransportador)
    : todosPedidos;

  const pendentes = pedidos.filter((p) => !["ENTREGUE", "CANCELADO", "DEVOLVIDO", "REENTREGA"].includes(p.statusEntrega));
  const acerto = pedidos.filter((p) => p.statusFinanceiro === "AGUARDANDO_ACERTO");
  const pedidosComLinks = await Promise.all(pedidos.map(comLinksAssinados));

  return (
    <div>
      <div className="filtros-topo">
        <FiltroTransportador transportadores={transportadores} />
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-value">{pedidos.length}</div>
          <div className="kpi-label">Total de pedidos</div>
        </div>
        <div className="kpi-card amber">
          <div className="kpi-value">{pendentes.length}</div>
          <div className="kpi-label">Pendentes de entrega</div>
        </div>
        <div className="kpi-card violet">
          <div className="kpi-value">{acerto.length}</div>
          <div className="kpi-label">Aguardando acerto</div>
        </div>
      </div>

      <ImportarPlanilha />
      <CriarPedido />

      <TabelaPedidos
        pedidos={pedidosComLinks.map((p) => ({
          id: p.id,
          cliente: p.cliente,
          transportador: p.transportador,
          statusEntrega: p.statusEntrega,
          statusPlanilha: p.statusPlanilha,
          statusFinanceiro: p.statusFinanceiro,
          valorPedido: Number(p.valorPedido),
          canhotoUrl: p.canhotoUrl,
          comprovantePagamentoUrl: p.comprovantePagamentoUrl,
        }))}
      />
    </div>
  );
}

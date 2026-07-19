import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, COOKIE_NAME, podeVerTudo } from "@/lib/auth";
import { prisma } from "@/lib/db";
import PedidoAcoes, { BadgeStatus } from "@/components/PedidoAcoes";
import ImportarPlanilha from "@/components/ImportarPlanilha";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const token = cookies().get(COOKIE_NAME)?.value;
  const sessao = token ? await verifySession(token) : null;
  if (!sessao || !podeVerTudo(sessao.papel)) redirect("/login");

  const pedidos = await prisma.pedido.findMany({ orderBy: { dataCriacao: "desc" } });
  const pendentes = pedidos.filter((p) => !["ENTREGUE", "CANCELADO", "DEVOLVIDO", "REENTREGA"].includes(p.statusEntrega));
  const acerto = pedidos.filter((p) => p.statusFinanceiro === "AGUARDANDO_ACERTO");

  return (
    <div>
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

      <table className="pedidos-table">
        <thead>
          <tr>
            <th>Nº</th>
            <th>Cliente</th>
            <th>Transportador</th>
            <th>Status</th>
            <th>Financeiro</th>
            <th>Valor</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {pedidos.map((p) => (
            <tr key={p.id}>
              <td>#{p.id}</td>
              <td>{p.cliente}</td>
              <td>{p.transportador}</td>
              <td><BadgeStatus status={p.statusEntrega} /></td>
              <td>{p.statusFinanceiro === "AGUARDANDO_ACERTO" ? <span className="badge badge-acerto">Aguardando acerto</span> : "—"}</td>
              <td>{Number(p.valorPedido).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
              <td><PedidoAcoes pedido={p} isAdmin /></td>
            </tr>
          ))}
        </tbody>
      </table>

    </div>
  );
}

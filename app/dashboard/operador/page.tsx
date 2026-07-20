import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { prisma } from "@/lib/db";
import PedidoAcoes, { BadgeStatus } from "@/components/PedidoAcoes";

export const dynamic = "force-dynamic";

export default async function OperadorDashboard() {
  const token = cookies().get(COOKIE_NAME)?.value;
  const sessao = token ? await verifySession(token) : null;
  if (!sessao) redirect("/login");
  if (sessao.papel !== "TRANSPORTADOR") redirect("/dashboard/admin");

  const pedidos = await prisma.pedido.findMany({
    where: { transportador: { equals: (sessao.transportadorNome ?? "___nenhum___").trim(), mode: "insensitive" } },
    orderBy: { dataCriacao: "desc" },
  });
  const pendentes = pedidos.filter((p) => !["ENTREGUE", "CANCELADO", "DEVOLVIDO", "REENTREGA"].includes(p.statusEntrega));

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>{sessao.transportadorNome}</h2>
      <p className="muted" style={{ marginBottom: 18 }}>{pendentes.length} pedido(s) pendente(s) de {pedidos.length} no total</p>

      <div className="pedido-list">
        {pedidos.length === 0 && <p className="muted">Nenhum pedido no momento.</p>}
        {pedidos.map((p) => (
          <div key={p.id} className="pedido-card">
            <div className="pedido-card-top">
              <span>
                <span className="pedido-numero">#{p.id}</span> <BadgeStatus status={p.statusEntrega} statusPlanilha={p.statusPlanilha} />
                {p.statusFinanceiro === "AGUARDANDO_ACERTO" && <span className="badge badge-acerto" style={{ marginLeft: 6 }}>Aguardando acerto</span>}
              </span>
              <span>{Number(p.valorPedido).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
            </div>
            <div className="pedido-cliente">{p.cliente}</div>
            <div className="pedido-endereco">{p.rua}, {p.numero} — {p.bairro}, {p.cidade}</div>
            <PedidoAcoes pedido={p} />
          </div>
        ))}
      </div>

    </div>
  );
}

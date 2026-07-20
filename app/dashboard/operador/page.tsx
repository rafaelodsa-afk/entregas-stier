import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { prisma } from "@/lib/db";
import ListaPedidosOperador from "@/components/ListaPedidosOperador";

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

      <ListaPedidosOperador
        pedidos={pedidos.map((p) => ({
          id: p.id,
          cliente: p.cliente,
          cidade: p.cidade,
          bairro: p.bairro,
          rua: p.rua,
          numero: p.numero,
          valorPedido: Number(p.valorPedido),
          statusEntrega: p.statusEntrega,
          statusFinanceiro: p.statusFinanceiro,
          statusPlanilha: p.statusPlanilha,
          canhotoUrl: p.canhotoUrl,
          comprovantePagamentoUrl: p.comprovantePagamentoUrl,
        }))}
      />
    </div>
  );
}

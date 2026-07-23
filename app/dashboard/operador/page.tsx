import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { comLinksAssinados } from "@/lib/r2";
import { geraPendenciaFinanceira } from "@/lib/pedidos";
import ListaPedidosOperador from "@/components/ListaPedidosOperador";

export const dynamic = "force-dynamic";

export default async function OperadorDashboard() {
  const token = cookies().get(COOKIE_NAME)?.value;
  const sessao = token ? await verifySession(token) : null;
  if (!sessao) redirect("/login");
  if (sessao.papel !== "TRANSPORTADOR") redirect("/dashboard/admin");

  const pedidos = await prisma.pedido.findMany({
    // Pedido em Reentrega some completamente da visão do transportador —
    // fica só com quem enxerga tudo (master/admin/analista) até ser
    // reatribuído; nesse momento passa a existir de novo, já como
    // Aguardando aceite, só pro transportador novo.
    where: {
      transportador: { equals: (sessao.transportadorNome ?? "___nenhum___").trim(), mode: "insensitive" },
      statusEntrega: { not: "REENTREGA" },
    },
    orderBy: { dataCriacao: "desc" },
    select: {
      id: true,
      cliente: true,
      cidade: true,
      bairro: true,
      rua: true,
      numero: true,
      valorPedido: true,
      statusEntrega: true,
      statusFinanceiro: true,
      statusPlanilha: true,
      canhotoUrl: true,
      comprovantePagamentoUrl: true,
      finalizadoSemCanhoto: true,
      operacao: true,
      formaPagamento: true,
    },
  });
  const pendentes = pedidos.filter((p) => !["ENTREGUE", "CANCELADO", "DEVOLVIDO"].includes(p.statusEntrega));
  const pedidosComLinks = await Promise.all(pedidos.map(comLinksAssinados));

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>{sessao.transportadorNome}</h2>
      <p className="muted" style={{ marginBottom: 18 }}>{pendentes.length} pedido(s) pendente(s) de {pedidos.length} no total</p>

      <ListaPedidosOperador
        pedidos={pedidosComLinks.map((p) => ({
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
          finalizadoSemCanhoto: p.finalizadoSemCanhoto,
          mostraIconeDinheiro: geraPendenciaFinanceira(p.operacao, p.formaPagamento),
        }))}
      />
    </div>
  );
}

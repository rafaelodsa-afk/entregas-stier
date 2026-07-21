import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, COOKIE_NAME, podeVerTudo, podeFinalizarSemCanhoto } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { comLinksAssinados } from "@/lib/r2";
import ImportarPlanilha from "@/components/ImportarPlanilha";
import CriarPedido from "@/components/CriarPedido";
import PainelPedidos from "@/components/PainelPedidos";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const token = cookies().get(COOKIE_NAME)?.value;
  const sessao = token ? await verifySession(token) : null;
  if (!sessao || !podeVerTudo(sessao.papel)) redirect("/login");

  const pedidos = await prisma.pedido.findMany({ orderBy: { dataCriacao: "desc" } });
  const transportadores = [...new Set(pedidos.map((p) => p.transportador))].sort();
  const pedidosComLinks = await Promise.all(pedidos.map(comLinksAssinados));

  return (
    <div>
      <PainelPedidos
        transportadores={transportadores}
        podeFinalizarLegado={podeFinalizarSemCanhoto(sessao.papel)}
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
          finalizadoSemCanhoto: p.finalizadoSemCanhoto,
        }))}
      >
        <ImportarPlanilha />
        <CriarPedido />
      </PainelPedidos>
    </div>
  );
}

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { obterCoordenadasDasCidades } from "@/lib/geocodificacao";
import PainelOperadorClient from "@/components/PainelOperadorClient";

export const dynamic = "force-dynamic";

export default async function PainelOperador() {
  const token = cookies().get(COOKIE_NAME)?.value;
  const sessao = token ? await verifySession(token) : null;
  if (!sessao) redirect("/login");
  if (sessao.papel !== "TRANSPORTADOR") redirect("/dashboard/admin");

  // Mesma regra de visibilidade da aba Pedidos: em Reentrega some daqui até
  // ser reatribuído.
  const pedidos = await prisma.pedido.findMany({
    where: {
      transportador: { equals: (sessao.transportadorNome ?? "___nenhum___").trim(), mode: "insensitive" },
      statusEntrega: { not: "REENTREGA" },
    },
  });

  // Geocodifica pra TODOS os pendentes (sem filtrar por data) — o filtro de
  // período é aplicado depois, no cliente; isso garante que qualquer período
  // escolhido já tenha as coordenadas das cidades disponíveis, sem precisar
  // buscar de novo no servidor a cada troca de data.
  const pendentesTodos = pedidos.filter((p) => !["ENTREGUE", "CANCELADO", "DEVOLVIDO"].includes(p.statusEntrega));
  const cidadesPendentes = pendentesTodos.map((p) => p.cidade).filter(Boolean);
  const coordenadas = await obterCoordenadasDasCidades(cidadesPendentes);

  return (
    <div>
      <h1 className="page-title">Painel</h1>
      <p className="page-sub">Panorama dos seus pedidos: onde estão as entregas pendentes, status geral e situação financeira.</p>

      <PainelOperadorClient
        pedidos={pedidos.map((p) => ({
          statusEntrega: p.statusEntrega,
          statusFinanceiro: p.statusFinanceiro,
          comprovantePagamentoUrl: p.comprovantePagamentoUrl,
          cidade: p.cidade,
          dataPedido: p.dataPedido,
        }))}
        coordenadas={coordenadas}
      />
    </div>
  );
}

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, COOKIE_NAME, podeVerTudo } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { obterCoordenadasDasCidades } from "@/lib/geocodificacao";
import GraficosClient from "@/components/GraficosClient";

export const dynamic = "force-dynamic";

export default async function GraficosPage({
  searchParams,
}: {
  searchParams: { transportador?: string };
}) {
  const token = cookies().get(COOKIE_NAME)?.value;
  const sessao = token ? await verifySession(token) : null;
  if (!sessao || !podeVerTudo(sessao.papel)) redirect("/dashboard");

  const todosPedidos = await prisma.pedido.findMany();
  const transportadores = [...new Set(todosPedidos.map((p) => p.transportador))];

  const filtroTransportador = searchParams.transportador ?? "";
  const pedidos = filtroTransportador
    ? todosPedidos.filter((p) => p.transportador.toLowerCase() === filtroTransportador.toLowerCase())
    : todosPedidos;

  // Geocodifica pra TODOS os pendentes do transportador selecionado (sem
  // filtrar por data) — o filtro de período é aplicado depois, no cliente.
  const pendentes = pedidos.filter((p) => !["ENTREGUE", "CANCELADO", "DEVOLVIDO", "REENTREGA"].includes(p.statusEntrega));
  const cidadesPendentes = pendentes.map((p) => p.cidade).filter(Boolean);
  const coordenadas = await obterCoordenadasDasCidades(cidadesPendentes);

  const resumo = (p: (typeof todosPedidos)[number]) => ({
    statusEntrega: p.statusEntrega,
    statusFinanceiro: p.statusFinanceiro,
    comprovantePagamentoUrl: p.comprovantePagamentoUrl,
    transportador: p.transportador,
    cidade: p.cidade,
    dataPedido: p.dataPedido,
  });

  return (
    <div>
      <h1 className="page-title">Gráficos e mapa</h1>
      <p className="page-sub">Panorama geral, distribuição por transportador, e onde estão as entregas pendentes.</p>

      <GraficosClient
        pedidos={pedidos.map(resumo)}
        todosPedidos={todosPedidos.map(resumo)}
        transportadores={transportadores}
        coordenadas={coordenadas}
        filtroTransportador={filtroTransportador}
      />
    </div>
  );
}

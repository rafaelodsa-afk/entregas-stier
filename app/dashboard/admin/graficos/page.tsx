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

  // Busca só as colunas que os gráficos/mapa realmente usam. Sem esse select
  // o Prisma trazia as ~30 colunas de todos os pedidos (quase 10 MB por
  // abertura de tela) só pra usar seis delas.
  const todosPedidos = await prisma.pedido.findMany({
    select: {
      statusEntrega: true,
      statusFinanceiro: true,
      comprovantePagamentoUrl: true,
      transportador: true,
      cidade: true,
      dataPedido: true,
    },
  });
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

  return (
    <div>
      <h1 className="page-title">Gráficos e mapa</h1>
      <p className="page-sub">Panorama geral, distribuição por transportador, e onde estão as entregas pendentes.</p>

      {/* Só a lista completa vai pro navegador — a lista filtrada por
          transportador é derivada lá dentro a partir dela. Antes as duas iam
          juntas, o que mandava a mesma coisa duas vezes. */}
      <GraficosClient
        todosPedidos={todosPedidos}
        transportadores={transportadores}
        coordenadas={coordenadas}
        filtroTransportador={filtroTransportador}
      />
    </div>
  );
}

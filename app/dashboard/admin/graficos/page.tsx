import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, COOKIE_NAME, podeVerTudo } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { obterCoordenadasDasCidades } from "@/lib/geocodificacao";
import GraficoDonut from "@/components/GraficoDonut";
import GraficoBarras from "@/components/GraficoBarras";
import MapaEntregasClient from "@/components/MapaEntregasClient";

export const dynamic = "force-dynamic";

const LABEL_STATUS: Record<string, string> = {
  AGUARDANDO_ACEITE: "Aguardando aceite",
  AGUARDANDO_CARREGAMENTO: "Aguardando carregamento",
  EM_ROTA: "Em rota de entrega",
  ENTREGUE: "Entregue",
  REENTREGA: "Reentrega",
  CANCELADO: "Cancelado",
  DEVOLVIDO: "Devolvido",
};

const COR_STATUS: Record<string, string> = {
  AGUARDANDO_ACEITE: "#e3a73e",
  AGUARDANDO_CARREGAMENTO: "#f0883e",
  EM_ROTA: "#4e8fe3",
  ENTREGUE: "#3fbf8f",
  REENTREGA: "#a78bfa",
  CANCELADO: "#e15c4a",
  DEVOLVIDO: "#8d95a1",
};

const CORES_TRANSPORTADOR = ["#e3a73e", "#4e8fe3", "#3fbf8f", "#a78bfa", "#f0883e", "#e15c4a", "#8d95a1"];

export default async function GraficosPage() {
  const token = cookies().get(COOKIE_NAME)?.value;
  const sessao = token ? await verifySession(token) : null;
  if (!sessao || !podeVerTudo(sessao.papel)) redirect("/dashboard");

  const pedidos = await prisma.pedido.findMany();

  const porStatus = Object.entries(LABEL_STATUS)
    .map(([status, label]) => ({
      label,
      valor: pedidos.filter((p) => p.statusEntrega === status).length,
      cor: COR_STATUS[status],
    }))
    .filter((d) => d.valor > 0);

  const transportadores = [...new Set(pedidos.map((p) => p.transportador))];
  const porTransportador = transportadores
    .map((t, i) => ({
      label: t,
      valor: pedidos.filter((p) => p.transportador === t).length,
      cor: CORES_TRANSPORTADOR[i % CORES_TRANSPORTADOR.length],
    }))
    .sort((a, b) => b.valor - a.valor);

  const pendentes = pedidos.filter((p) => !["ENTREGUE", "CANCELADO", "DEVOLVIDO", "REENTREGA"].includes(p.statusEntrega));
  const cidadesPendentes = pendentes.map((p) => p.cidade).filter(Boolean);
  const coordenadas = await obterCoordenadasDasCidades(cidadesPendentes);
  const pontosMapa = coordenadas.map((c) => ({
    ...c,
    quantidade: pendentes.filter((p) => p.cidade.trim() === c.cidade).length,
  }));

  return (
    <div>
      <h1 className="page-title">Gráficos e mapa</h1>
      <p className="page-sub">Panorama geral, distribuição por transportador, e onde estão as entregas pendentes.</p>

      <div className="graficos-grid">
        <div className="form-card">
          <h2>Panorama por status</h2>
          <GraficoDonut dados={porStatus} />
        </div>
        <div className="form-card">
          <h2>Pedidos por transportador</h2>
          <GraficoBarras dados={porTransportador} />
        </div>
      </div>

      <div className="form-card">
        <h2>Mapa de entregas pendentes</h2>
        <p className="page-sub" style={{ marginBottom: 12 }}>
          Posição aproximada por cidade (não é o endereço exato) — o tamanho do círculo indica quantos
          pedidos pendentes há naquela cidade.
        </p>
        <MapaEntregasClient pontos={pontosMapa} />
      </div>
    </div>
  );
}

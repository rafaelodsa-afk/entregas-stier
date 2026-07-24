import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { obterCoordenadasDasCidades } from "@/lib/geocodificacao";
import { LABEL_STATUS, COR_STATUS } from "@/lib/statusLabels";
import GraficoDonut from "@/components/GraficoDonut";
import MapaEntregasClient from "@/components/MapaEntregasClient";
import AcertoSplit from "@/components/AcertoSplit";

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

  const porStatus = Object.entries(LABEL_STATUS)
    .map(([status, label]) => ({
      label,
      valor: pedidos.filter((p) => p.statusEntrega === status).length,
      cor: COR_STATUS[status],
    }))
    .filter((d) => d.valor > 0);

  const pendentes = pedidos.filter((p) => !["ENTREGUE", "CANCELADO", "DEVOLVIDO"].includes(p.statusEntrega));
  const cidadesPendentes = pendentes.map((p) => p.cidade).filter(Boolean);
  const coordenadas = await obterCoordenadasDasCidades(cidadesPendentes);
  const pontosMapa = coordenadas.map((c) => ({
    ...c,
    quantidade: pendentes.filter((p) => p.cidade.trim() === c.cidade).length,
  }));

  const aguardandoAcerto = pedidos.filter((p) => p.statusFinanceiro === "AGUARDANDO_ACERTO");

  return (
    <div>
      <h1 className="page-title">Painel</h1>
      <p className="page-sub">Panorama dos seus pedidos: onde estão as entregas pendentes, status geral e situação financeira.</p>

      <div className="graficos-grid">
        <div className="form-card">
          <h2>Mapa de entregas pendentes</h2>
          <p className="page-sub" style={{ marginBottom: 12 }}>
            Posição aproximada por cidade — o tamanho do círculo indica quantos pedidos pendentes há naquela cidade.
          </p>
          <MapaEntregasClient pontos={pontosMapa} />
        </div>
        <div className="form-card">
          <h2>Seus pedidos por status</h2>
          <GraficoDonut dados={porStatus} />
        </div>
      </div>

      <div className="form-card">
        <h2>Aguardando acerto</h2>
        <AcertoSplit pedidos={aguardandoAcerto} mostrarGrafico />
      </div>
    </div>
  );
}

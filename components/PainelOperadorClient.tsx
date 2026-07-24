"use client";

import { useState } from "react";
import GraficoDonut from "@/components/GraficoDonut";
import MapaEntregasClient from "@/components/MapaEntregasClient";
import AcertoSplit from "@/components/AcertoSplit";
import FiltroPeriodo from "@/components/FiltroPeriodo";
import { dataNoIntervalo } from "@/lib/filtroPeriodo";
import { LABEL_STATUS, COR_STATUS } from "@/lib/statusLabels";

type PedidoResumo = {
  statusEntrega: string;
  statusFinanceiro: string;
  comprovantePagamentoUrl: string | null;
  cidade: string;
  dataPedido: Date | null;
};

type Coordenada = { cidade: string; latitude: number; longitude: number };

export default function PainelOperadorClient({
  pedidos,
  coordenadas,
}: {
  pedidos: PedidoResumo[];
  coordenadas: Coordenada[];
}) {
  const [dataInicial, setDataInicial] = useState("");
  const [dataFinal, setDataFinal] = useState("");

  const filtrados = pedidos.filter((p) => dataNoIntervalo(p.dataPedido, dataInicial, dataFinal));

  const porStatus = Object.entries(LABEL_STATUS)
    .map(([status, label]) => ({
      label,
      valor: filtrados.filter((p) => p.statusEntrega === status).length,
      cor: COR_STATUS[status],
    }))
    .filter((d) => d.valor > 0);

  const pendentes = filtrados.filter((p) => !["ENTREGUE", "CANCELADO", "DEVOLVIDO"].includes(p.statusEntrega));
  const cidadesComPedidos = new Set(pendentes.map((p) => p.cidade.trim()).filter(Boolean));
  const pontosMapa = coordenadas
    .filter((c) => cidadesComPedidos.has(c.cidade))
    .map((c) => ({ ...c, quantidade: pendentes.filter((p) => p.cidade.trim() === c.cidade).length }));

  const aguardandoAcerto = filtrados.filter((p) => p.statusFinanceiro === "AGUARDANDO_ACERTO");

  return (
    <div>
      <div className="filtros-topo">
        <FiltroPeriodo dataInicial={dataInicial} dataFinal={dataFinal} onChangeInicial={setDataInicial} onChangeFinal={setDataFinal} />
      </div>

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

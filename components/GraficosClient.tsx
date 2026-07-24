"use client";

import { useState } from "react";
import GraficoDonut from "@/components/GraficoDonut";
import GraficoBarras from "@/components/GraficoBarras";
import MapaEntregasClient from "@/components/MapaEntregasClient";
import AcertoSplit from "@/components/AcertoSplit";
import FiltroTransportador from "@/components/FiltroTransportador";
import FiltroPeriodo from "@/components/FiltroPeriodo";
import { dataNoIntervalo } from "@/lib/filtroPeriodo";
import { LABEL_STATUS, COR_STATUS } from "@/lib/statusLabels";

type PedidoResumo = {
  statusEntrega: string;
  statusFinanceiro: string;
  comprovantePagamentoUrl: string | null;
  transportador: string;
  cidade: string;
  dataPedido: Date | null;
};

type Coordenada = { cidade: string; latitude: number; longitude: number };

const CORES_TRANSPORTADOR = ["#e3a73e", "#4e8fe3", "#3fbf8f", "#a78bfa", "#f0883e", "#e15c4a", "#8d95a1"];

export default function GraficosClient({
  pedidos,
  todosPedidos,
  transportadores,
  coordenadas,
  filtroTransportador,
}: {
  pedidos: PedidoResumo[];
  todosPedidos: PedidoResumo[];
  transportadores: string[];
  coordenadas: Coordenada[];
  filtroTransportador: string;
}) {
  const [dataInicial, setDataInicial] = useState("");
  const [dataFinal, setDataFinal] = useState("");

  const pedidosFiltrados = pedidos.filter((p) => dataNoIntervalo(p.dataPedido, dataInicial, dataFinal));
  const todosFiltrados = todosPedidos.filter((p) => dataNoIntervalo(p.dataPedido, dataInicial, dataFinal));

  const porStatus = Object.entries(LABEL_STATUS)
    .map(([status, label]) => ({
      label,
      valor: pedidosFiltrados.filter((p) => p.statusEntrega === status).length,
      cor: COR_STATUS[status],
    }))
    .filter((d) => d.valor > 0);

  // O gráfico por transportador sempre compara todos, mesmo com filtro de
  // transportador ativo (só destaca visualmente o selecionado) — o filtro
  // de período, esse sim, se aplica igual aos dois gráficos.
  const porTransportador = transportadores
    .map((t, i) => ({
      label: t,
      valor: todosFiltrados.filter((p) => p.transportador === t).length,
      cor: CORES_TRANSPORTADOR[i % CORES_TRANSPORTADOR.length],
    }))
    .sort((a, b) => b.valor - a.valor);

  const pendentes = pedidosFiltrados.filter((p) => !["ENTREGUE", "CANCELADO", "DEVOLVIDO", "REENTREGA"].includes(p.statusEntrega));
  const cidadesComPedidos = new Set(pendentes.map((p) => p.cidade.trim()).filter(Boolean));
  const pontosMapa = coordenadas
    .filter((c) => cidadesComPedidos.has(c.cidade))
    .map((c) => ({ ...c, quantidade: pendentes.filter((p) => p.cidade.trim() === c.cidade).length }));

  const aguardandoAcerto = pedidosFiltrados.filter((p) => p.statusFinanceiro === "AGUARDANDO_ACERTO");

  return (
    <div>
      <div className="filtros-topo">
        <FiltroTransportador transportadores={transportadores} />
        <FiltroPeriodo dataInicial={dataInicial} dataFinal={dataFinal} onChangeInicial={setDataInicial} onChangeFinal={setDataFinal} />
      </div>

      <div className="graficos-grid">
        <div className="form-card">
          <h2>Panorama por status{filtroTransportador ? ` — ${filtroTransportador}` : ""}</h2>
          <GraficoDonut dados={porStatus} />
        </div>
        <div className="form-card">
          <h2>Pedidos por transportador</h2>
          <GraficoBarras dados={porTransportador} destaque={filtroTransportador} />
        </div>
        <div className="form-card">
          <h2>Aguardando acerto{filtroTransportador ? ` — ${filtroTransportador}` : ""}</h2>
          <AcertoSplit pedidos={aguardandoAcerto} mostrarGrafico />
        </div>
      </div>

      <div className="form-card">
        <h2>Mapa de entregas pendentes{filtroTransportador ? ` — ${filtroTransportador}` : ""}</h2>
        <p className="page-sub" style={{ marginBottom: 12 }}>
          Posição aproximada por cidade (não é o endereço exato) — o tamanho do círculo indica quantos
          pedidos pendentes há naquela cidade.
        </p>
        <MapaEntregasClient pontos={pontosMapa} />
      </div>
    </div>
  );
}

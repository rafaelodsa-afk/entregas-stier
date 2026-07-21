"use client";

import { useMemo, useState } from "react";
import TabelaPedidos from "@/components/TabelaPedidos";
import FiltroMultiplo from "@/components/FiltroMultiplo";
import { LABEL_STATUS } from "@/lib/statusLabels";

type Pedido = {
  id: string;
  cliente: string;
  transportador: string;
  statusEntrega: string;
  statusPlanilha: string | null;
  statusFinanceiro: string;
  valorPedido: number;
  canhotoUrl: string | null;
  comprovantePagamentoUrl: string | null;
  finalizadoSemCanhoto: boolean;
};

const OPCOES_STATUS = Object.entries(LABEL_STATUS).map(([valor, rotulo]) => ({ valor, rotulo }));

export default function PainelPedidos({
  pedidos,
  transportadores,
  podeFinalizarLegado = false,
  children,
}: {
  pedidos: Pedido[];
  transportadores: string[];
  podeFinalizarLegado?: boolean;
  children?: React.ReactNode;
}) {
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<Set<string>>(new Set());
  const [transportadorFiltro, setTransportadorFiltro] = useState<Set<string>>(new Set());

  const opcoesTransportador = useMemo(
    () => transportadores.map((t) => ({ valor: t, rotulo: t })),
    [transportadores]
  );

  const buscaNormalizada = busca.trim().toLowerCase();
  const filtrados = pedidos.filter((p) => {
    if (statusFiltro.size > 0 && !statusFiltro.has(p.statusEntrega)) return false;
    if (transportadorFiltro.size > 0 && !transportadorFiltro.has(p.transportador)) return false;
    if (buscaNormalizada) {
      const alvo = `${p.id} ${p.cliente}`.toLowerCase();
      if (!alvo.includes(buscaNormalizada)) return false;
    }
    return true;
  });

  const pendentes = filtrados.filter((p) => !["ENTREGUE", "CANCELADO", "DEVOLVIDO", "REENTREGA"].includes(p.statusEntrega));
  const acerto = filtrados.filter((p) => p.statusFinanceiro === "AGUARDANDO_ACERTO");

  return (
    <div>
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-value">{filtrados.length}</div>
          <div className="kpi-label">Total de pedidos</div>
        </div>
        <div className="kpi-card amber">
          <div className="kpi-value">{pendentes.length}</div>
          <div className="kpi-label">Pendentes de entrega</div>
        </div>
        <div className="kpi-card violet">
          <div className="kpi-value">{acerto.length}</div>
          <div className="kpi-label">Aguardando acerto</div>
        </div>
      </div>

      {children}

      <div className="filtros-pedidos">
        <input
          type="text"
          placeholder="Buscar por nº do pedido ou cliente..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="busca-pedidos"
        />
        <FiltroMultiplo rotulo="Status" opcoes={OPCOES_STATUS} selecionados={statusFiltro} onChange={setStatusFiltro} />
        <FiltroMultiplo rotulo="Transportadores" opcoes={opcoesTransportador} selecionados={transportadorFiltro} onChange={setTransportadorFiltro} />
      </div>

      <TabelaPedidos pedidos={filtrados} podeFinalizarLegado={podeFinalizarLegado} />
    </div>
  );
}

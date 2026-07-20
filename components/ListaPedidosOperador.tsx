"use client";

import { useState } from "react";
import PedidoAcoes, { BadgeStatus, LABEL_STATUS } from "@/components/PedidoAcoes";

type Pedido = {
  id: string;
  cliente: string;
  cidade: string;
  bairro: string;
  rua: string;
  numero: string;
  valorPedido: number;
  statusEntrega: string;
  statusFinanceiro: string;
  statusPlanilha: string | null;
  canhotoUrl: string | null;
  comprovantePagamentoUrl: string | null;
};

export default function ListaPedidosOperador({ pedidos }: { pedidos: Pedido[] }) {
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("");

  const buscaNormalizada = busca.trim().toLowerCase();
  const filtrados = pedidos.filter((p) => {
    if (statusFiltro && p.statusEntrega !== statusFiltro) return false;
    if (buscaNormalizada) {
      const alvo = `${p.id} ${p.cliente}`.toLowerCase();
      if (!alvo.includes(buscaNormalizada)) return false;
    }
    return true;
  });

  return (
    <div>
      <div className="filtros-pedidos">
        <input
          type="text"
          placeholder="Buscar por nº do pedido ou cliente..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="busca-pedidos"
        />
        <select value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)} className="filtro-transportador">
          <option value="">Todos os status</option>
          {Object.entries(LABEL_STATUS).map(([valor, label]) => (
            <option key={valor} value={valor}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="pedido-list">
        {filtrados.length === 0 && <p className="muted">Nenhum pedido encontrado.</p>}
        {filtrados.map((p) => (
          <div key={p.id} className="pedido-card">
            <div className="pedido-card-top">
              <span>
                <span className="pedido-numero">#{p.id}</span> <BadgeStatus status={p.statusEntrega} statusPlanilha={p.statusPlanilha} />
                {p.statusFinanceiro === "AGUARDANDO_ACERTO" && <span className="badge badge-acerto" style={{ marginLeft: 6 }}>Aguardando acerto</span>}
              </span>
              <span>{Number(p.valorPedido).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
            </div>
            <div className="pedido-cliente">{p.cliente}</div>
            <div className="pedido-endereco">{p.rua}, {p.numero} — {p.bairro}, {p.cidade}</div>
            <PedidoAcoes pedido={p} />
          </div>
        ))}
      </div>
    </div>
  );
}

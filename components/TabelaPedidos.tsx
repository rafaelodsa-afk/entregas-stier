"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PedidoAcoes, { BadgeStatus } from "@/components/PedidoAcoes";

type Pedido = {
  id: string;
  cliente: string;
  transportador: string;
  statusEntrega: string;
  statusFinanceiro: string;
  valorPedido: number;
  canhotoUrl: string | null;
};

const LABEL_STATUS: Record<string, string> = {
  AGUARDANDO_ACEITE: "Aguardando aceite",
  AGUARDANDO_CARREGAMENTO: "Aguardando carregamento",
  EM_ROTA: "Em rota de entrega",
  ENTREGUE: "Entregue",
  REENTREGA: "Reentrega",
  CANCELADO: "Cancelado",
  DEVOLVIDO: "Devolvido",
};

export default function TabelaPedidos({ pedidos }: { pedidos: Pedido[] }) {
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("");
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const router = useRouter();

  const buscaNormalizada = busca.trim().toLowerCase();
  const filtrados = pedidos.filter((p) => {
    if (statusFiltro && p.statusEntrega !== statusFiltro) return false;
    if (buscaNormalizada) {
      const alvo = `${p.id} ${p.cliente}`.toLowerCase();
      if (!alvo.includes(buscaNormalizada)) return false;
    }
    return true;
  });

  async function excluir(id: string) {
    if (!window.confirm(`Excluir o pedido #${id} definitivamente? Essa ação não pode ser desfeita.`)) {
      return;
    }
    setErro("");
    setExcluindoId(id);
    try {
      const res = await fetch(`/api/pedidos/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErro(data.erro || "Não foi possível excluir o pedido.");
        return;
      }
      router.refresh();
    } catch (err) {
      console.error(err);
      setErro("Erro de conexão.");
    } finally {
      setExcluindoId(null);
    }
  }

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

      {erro && <p className="erro" style={{ marginBottom: 10 }}>{erro}</p>}

      <table className="pedidos-table">
        <thead>
          <tr>
            <th>Nº</th>
            <th>Cliente</th>
            <th>Transportador</th>
            <th>Status</th>
            <th>Financeiro</th>
            <th>Valor</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {filtrados.map((p) => (
            <tr key={p.id}>
              <td>#{p.id}</td>
              <td>{p.cliente}</td>
              <td>{p.transportador}</td>
              <td><BadgeStatus status={p.statusEntrega} /></td>
              <td>{p.statusFinanceiro === "AGUARDANDO_ACERTO" ? <span className="badge badge-acerto">Aguardando acerto</span> : "—"}</td>
              <td>{p.valorPedido.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
              <td>
                <div className="acoes-linha">
                  <PedidoAcoes pedido={p} isAdmin />
                  <button className="btn-excluir" disabled={excluindoId === p.id} onClick={() => excluir(p.id)}>
                    {excluindoId === p.id ? "..." : "Excluir"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {filtrados.length === 0 && (
            <tr>
              <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 20 }}>
                Nenhum pedido encontrado.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PedidoAcoes, { BadgeStatus } from "@/components/PedidoAcoes";
import IconeDinheiro from "@/components/IconeDinheiro";

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
  mostraIconeDinheiro: boolean;
};

// Componente só de apresentação — recebe a lista já filtrada (busca +
// status + transportador ficam no PainelPedidos, que fica em volta desta
// tabela e também mostra os KPIs).
export default function TabelaPedidos({ pedidos, podeFinalizarLegado = false }: { pedidos: Pedido[]; podeFinalizarLegado?: boolean }) {
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const router = useRouter();

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
          {pedidos.map((p) => (
            <tr key={p.id}>
              <td><Link className="link-canhoto" href={`/dashboard/admin/pedidos/${p.id}`}>#{p.id}</Link></td>
              <td>{p.cliente}</td>
              <td>{p.transportador}</td>
              <td>
                <BadgeStatus status={p.statusEntrega} statusPlanilha={p.statusPlanilha} finalizadoSemCanhoto={p.finalizadoSemCanhoto} />
                {p.mostraIconeDinheiro && <IconeDinheiro />}
              </td>
              <td>{p.statusFinanceiro === "AGUARDANDO_ACERTO" ? <span className="badge badge-acerto">Aguardando acerto</span> : "—"}</td>
              <td>{p.valorPedido.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
              <td>
                <div className="acoes-linha">
                  <PedidoAcoes pedido={p} isAdmin podeFinalizarLegado={podeFinalizarLegado} />
                  <button className="btn-excluir" disabled={excluindoId === p.id} onClick={() => excluir(p.id)}>
                    {excluindoId === p.id ? "..." : "Excluir"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {pedidos.length === 0 && (
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

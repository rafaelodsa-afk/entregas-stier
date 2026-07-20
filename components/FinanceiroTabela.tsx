"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type PedidoAberto = {
  id: string;
  cliente: string;
  transportador: string;
  formaPagamento: string;
  valorPedido: number;
  dataEntrega: Date | null;
};

const LABEL_PAGAMENTO: Record<string, string> = {
  DINHEIRO: "Dinheiro",
  PIX: "PIX",
  BOLETO: "Boleto",
};

function formatarData(data: Date | null) {
  if (!data) return "—";
  return new Date(data).toLocaleDateString("pt-BR");
}

function formatarValor(valor: number) {
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function FinanceiroTabela({ pedidos }: { pedidos: PedidoAberto[] }) {
  const [lista, setLista] = useState(pedidos);
  const [idEmAcao, setIdEmAcao] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const router = useRouter();

  async function marcarComoRecebido(id: string) {
    setErro("");
    setIdEmAcao(id);
    try {
      const res = await fetch(`/api/pedidos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "confirmarAcerto" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErro(data.erro || "Não foi possível confirmar o acerto.");
        return;
      }
      setLista((atual) => atual.filter((p) => p.id !== id));
      router.refresh();
    } catch (err) {
      console.error(err);
      setErro("Erro de conexão.");
    } finally {
      setIdEmAcao(null);
    }
  }

  const total = lista.reduce((soma, p) => soma + Number(p.valorPedido), 0);

  return (
    <div>
      <div className="kpi-grid" style={{ gridTemplateColumns: "1fr" }}>
        <div className="kpi-card violet">
          <div className="kpi-value">{formatarValor(total)}</div>
          <div className="kpi-label">Total aguardando acerto ({lista.length} pedido(s))</div>
        </div>
      </div>

      {erro && <p className="erro" style={{ marginTop: 10 }}>{erro}</p>}

      {lista.length === 0 ? (
        <p className="muted" style={{ marginTop: 16 }}>Nada aguardando acerto no momento.</p>
      ) : (
        <table className="pedidos-table" style={{ marginTop: 16 }}>
          <thead>
            <tr>
              <th>Nº</th>
              <th>Cliente</th>
              <th>Transportador</th>
              <th>Pagamento</th>
              <th>Entregue em</th>
              <th>Valor</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.id}>
                <td>#{p.id}</td>
                <td>{p.cliente}</td>
                <td>{p.transportador}</td>
                <td>{LABEL_PAGAMENTO[p.formaPagamento] ?? p.formaPagamento}</td>
                <td>{formatarData(p.dataEntrega)}</td>
                <td>{formatarValor(p.valorPedido)}</td>
                <td>
                  <button disabled={idEmAcao === p.id} onClick={() => marcarComoRecebido(p.id)}>
                    {idEmAcao === p.id ? "..." : "Marcar como recebido"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

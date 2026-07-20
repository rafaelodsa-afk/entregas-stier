type PedidoPrevisto = {
  id: string;
  cliente: string;
  transportador: string;
  formaPagamento: string;
  statusEntrega: string;
  valorPedido: number;
};

const LABEL_PAGAMENTO: Record<string, string> = {
  DINHEIRO: "Dinheiro",
  PIX: "PIX",
};

const LABEL_STATUS_ENTREGA: Record<string, string> = {
  AGUARDANDO_CARREGAMENTO: "Aguardando carregamento",
  EM_ROTA: "Em rota de entrega",
  AGUARDANDO_CANHOTO: "Entregue (planilha) — aguardando canhoto",
};

function formatarValor(valor: number) {
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function FinanceiroPrevisto({ pedidos }: { pedidos: PedidoPrevisto[] }) {
  const total = pedidos.reduce((soma, p) => soma + Number(p.valorPedido), 0);

  return (
    <div>
      <div className="kpi-grid" style={{ gridTemplateColumns: "1fr" }}>
        <div className="kpi-card amber">
          <div className="kpi-value">{formatarValor(total)}</div>
          <div className="kpi-label">Previsto — ainda não entregue ({pedidos.length} pedido(s))</div>
        </div>
      </div>

      {pedidos.length === 0 ? (
        <p className="muted" style={{ marginTop: 16 }}>Nenhum pedido aceito com Dinheiro/PIX aguardando entrega no momento.</p>
      ) : (
        <table className="pedidos-table" style={{ marginTop: 16 }}>
          <thead>
            <tr>
              <th>Nº</th>
              <th>Cliente</th>
              <th>Transportador</th>
              <th>Pagamento</th>
              <th>Status</th>
              <th>Valor</th>
              <th>Observação</th>
            </tr>
          </thead>
          <tbody>
            {pedidos.map((p) => (
              <tr key={p.id}>
                <td>#{p.id}</td>
                <td>{p.cliente}</td>
                <td>{p.transportador}</td>
                <td>{LABEL_PAGAMENTO[p.formaPagamento] ?? p.formaPagamento}</td>
                <td>{LABEL_STATUS_ENTREGA[p.statusEntrega] ?? p.statusEntrega}</td>
                <td>{formatarValor(p.valorPedido)}</td>
                <td className="muted">Ainda não entregue</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

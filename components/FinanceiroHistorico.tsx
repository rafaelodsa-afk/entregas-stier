import { formatarDataPura } from "@/lib/formatarData";

type PedidoPago = {
  id: string;
  cliente: string;
  transportador: string;
  valorPedido: number;
  dataPedido: Date | null;
  acertoConfirmadoEm: Date | null;
  comprovantePagamentoUrl: string | null;
};

export default function FinanceiroHistorico({ pedidos }: { pedidos: PedidoPago[] }) {
  if (pedidos.length === 0) {
    return <p className="muted">Nenhum acerto confirmado ainda.</p>;
  }

  return (
    <table className="pedidos-table">
      <thead>
        <tr>
          <th>Nº</th>
          <th>Cliente</th>
          <th>Transportador</th>
          <th>Data do pedido</th>
          <th>Valor</th>
          <th>Recebido em</th>
          <th>Comprovante</th>
        </tr>
      </thead>
      <tbody>
        {pedidos.map((p) => (
          <tr key={p.id}>
            <td>#{p.id}</td>
            <td>{p.cliente}</td>
            <td>{p.transportador}</td>
            <td>{formatarDataPura(p.dataPedido)}</td>
            <td>{Number(p.valorPedido).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
            <td>{p.acertoConfirmadoEm ? new Date(p.acertoConfirmadoEm).toLocaleDateString("pt-BR") : "—"}</td>
            <td>
              {p.comprovantePagamentoUrl ? (
                <a className="link-canhoto" href={p.comprovantePagamentoUrl} target="_blank" rel="noreferrer">
                  Ver comprovante
                </a>
              ) : (
                <span className="muted">Sem comprovante anexado</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

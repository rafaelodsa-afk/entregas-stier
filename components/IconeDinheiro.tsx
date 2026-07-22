// Aviso visual permanente (não some quando o status muda) de que esse
// pedido é Venda + pagamento à vista (Dinheiro/Pix) — mesma regra que
// decide "Aguardando acerto" depois da entrega, só que mostrada desde já.
export default function IconeDinheiro() {
  return (
    <span
      className="icone-dinheiro"
      title="Pagamento em dinheiro/Pix — vai precisar de acerto financeiro após a entrega"
    >
      $
    </span>
  );
}

import GraficoDonut from "@/components/GraficoDonut";

type Item = { comprovantePagamentoUrl: string | null };

// Separa "aguardando acerto" em duas situações bem diferentes pro
// transportador: ele ainda não mandou comprovante (precisa agir) vs. já
// mandou e só está esperando a Stier confirmar o recebimento.
export default function AcertoSplit({ pedidos, mostrarGrafico = false }: { pedidos: Item[]; mostrarGrafico?: boolean }) {
  const semComprovante = pedidos.filter((p) => !p.comprovantePagamentoUrl);
  const comComprovante = pedidos.filter((p) => p.comprovantePagamentoUrl);

  return (
    <div>
      <div className="kpi-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="kpi-card orange">
          <div className="kpi-value">{semComprovante.length}</div>
          <div className="kpi-label">Aguardando acerto — sem comprovante</div>
        </div>
        <div className="kpi-card cyan">
          <div className="kpi-value">{comComprovante.length}</div>
          <div className="kpi-label">Aguardando acerto — comprovante em análise</div>
        </div>
      </div>
      {mostrarGrafico && semComprovante.length + comComprovante.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <GraficoDonut
            tamanho={160}
            dados={[
              { label: "Sem comprovante", valor: semComprovante.length, cor: "#f0883e" },
              { label: "Comprovante em análise", valor: comComprovante.length, cor: "#38b6d4" },
            ]}
          />
        </div>
      )}
    </div>
  );
}

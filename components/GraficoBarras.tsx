type Barra = { label: string; valor: number; cor: string };

export default function GraficoBarras({ dados }: { dados: Barra[] }) {
  if (dados.length === 0) return <p className="muted">Sem pedidos para mostrar ainda.</p>;
  const max = Math.max(...dados.map((d) => d.valor), 1);

  return (
    <div className="grafico-barras">
      {dados.map((d, i) => (
        <div className="barra-linha" key={i}>
          <span className="barra-label">{d.label}</span>
          <div className="barra-trilho">
            <div className="barra-preenchida" style={{ width: `${(d.valor / max) * 100}%`, background: d.cor }} />
          </div>
          <span className="barra-valor">{d.valor}</span>
        </div>
      ))}
    </div>
  );
}

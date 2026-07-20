type Barra = { label: string; valor: number; cor: string };

export default function GraficoBarras({ dados, destaque }: { dados: Barra[]; destaque?: string }) {
  if (dados.length === 0) return <p className="muted">Sem pedidos para mostrar ainda.</p>;
  const max = Math.max(...dados.map((d) => d.valor), 1);
  const temDestaque = Boolean(destaque);

  return (
    <div className="grafico-barras">
      {dados.map((d, i) => {
        const selecionada = temDestaque && d.label === destaque;
        return (
          <div className={`barra-linha${temDestaque && !selecionada ? " barra-esmaecida" : ""}`} key={i}>
            <span className="barra-label">{d.label}</span>
            <div className="barra-trilho">
              <div className="barra-preenchida" style={{ width: `${(d.valor / max) * 100}%`, background: d.cor }} />
            </div>
            <span className="barra-valor">{d.valor}</span>
          </div>
        );
      })}
    </div>
  );
}

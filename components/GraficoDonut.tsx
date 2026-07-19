type Fatia = { label: string; valor: number; cor: string };

export default function GraficoDonut({ dados, tamanho = 180 }: { dados: Fatia[]; tamanho?: number }) {
  const total = dados.reduce((soma, d) => soma + d.valor, 0);
  const raio = 70;
  const centro = 90;
  const circunferencia = 2 * Math.PI * raio;
  let offsetAcumulado = 0;

  return (
    <div className="grafico-donut-wrap">
      <svg viewBox="0 0 180 180" width={tamanho} height={tamanho}>
        <circle cx={centro} cy={centro} r={raio} fill="none" stroke="#20242a" strokeWidth="24" />
        {total > 0 &&
          dados.map((d, i) => {
            if (d.valor === 0) return null;
            const comprimento = (d.valor / total) * circunferencia;
            const el = (
              <circle
                key={i}
                cx={centro}
                cy={centro}
                r={raio}
                fill="none"
                stroke={d.cor}
                strokeWidth="24"
                strokeDasharray={`${comprimento} ${circunferencia}`}
                strokeDashoffset={-offsetAcumulado}
                transform={`rotate(-90 ${centro} ${centro})`}
              />
            );
            offsetAcumulado += comprimento;
            return el;
          })}
        <text x={centro} y={centro - 4} textAnchor="middle" className="grafico-donut-total">
          {total}
        </text>
        <text x={centro} y={centro + 16} textAnchor="middle" className="grafico-donut-label">
          pedido(s)
        </text>
      </svg>
      <ul className="grafico-legenda">
        {dados.map((d, i) => (
          <li key={i}>
            <span className="legenda-cor" style={{ background: d.cor }} />
            {d.label} <strong>{d.valor}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

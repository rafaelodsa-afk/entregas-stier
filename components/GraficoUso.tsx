// Gráfico de rosca genérico "usado x limite" — mesma técnica de desenho do
// GraficoDonut (que mostra pedidos por status), só que aqui a fatia é
// sempre 2 partes: usado e livre, com o percentual no centro.
export default function GraficoUso({
  titulo,
  usadoBytes,
  limiteBytes,
  cor,
  tamanho = 180,
}: {
  titulo: string;
  usadoBytes: number;
  limiteBytes: number;
  cor: string;
  tamanho?: number;
}) {
  const usadoClamped = Math.min(usadoBytes, limiteBytes);
  const livre = Math.max(0, limiteBytes - usadoBytes);
  const percentual = limiteBytes > 0 ? Math.round((usadoBytes / limiteBytes) * 100) : 0;
  const raio = 70;
  const centro = 90;
  const circunferencia = 2 * Math.PI * raio;
  const comprimentoUsado = (usadoClamped / limiteBytes) * circunferencia;

  function formatarGB(bytes: number) {
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  }

  return (
    <div className="grafico-donut-wrap">
      <h3 style={{ marginBottom: 8 }}>{titulo}</h3>
      <svg viewBox="0 0 180 180" width={tamanho} height={tamanho}>
        <circle cx={centro} cy={centro} r={raio} fill="none" stroke="#20242a" strokeWidth="24" />
        {usadoClamped > 0 && (
          <circle
            cx={centro}
            cy={centro}
            r={raio}
            fill="none"
            stroke={cor}
            strokeWidth="24"
            strokeDasharray={`${comprimentoUsado} ${circunferencia}`}
            transform={`rotate(-90 ${centro} ${centro})`}
          />
        )}
        <text x={centro} y={centro - 4} textAnchor="middle" className="grafico-donut-total">
          {percentual}%
        </text>
        <text x={centro} y={centro + 16} textAnchor="middle" className="grafico-donut-label">
          usado
        </text>
      </svg>
      <ul className="grafico-legenda">
        <li>
          <span className="legenda-cor" style={{ background: cor }} />
          Usado <strong>{formatarGB(usadoBytes)}</strong>
        </li>
        <li>
          <span className="legenda-cor" style={{ background: "#20242a" }} />
          Livre <strong>{formatarGB(livre)}</strong>
        </li>
        <li className="muted">Limite do plano: {formatarGB(limiteBytes)}</li>
      </ul>
    </div>
  );
}

"use client";

export default function FiltroPeriodo({
  dataInicial,
  dataFinal,
  onChangeInicial,
  onChangeFinal,
}: {
  dataInicial: string;
  dataFinal: string;
  onChangeInicial: (valor: string) => void;
  onChangeFinal: (valor: string) => void;
}) {
  return (
    <div className="filtro-periodo">
      <input
        type="date"
        value={dataInicial}
        onChange={(e) => onChangeInicial(e.target.value)}
        className="filtro-periodo-input"
        aria-label="Data inicial"
        title="Data inicial"
      />
      <span className="filtro-periodo-separador">até</span>
      <input
        type="date"
        value={dataFinal}
        onChange={(e) => onChangeFinal(e.target.value)}
        className="filtro-periodo-input"
        aria-label="Data final"
        title="Data final"
      />
    </div>
  );
}

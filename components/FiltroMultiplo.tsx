"use client";

import { useEffect, useRef, useState } from "react";

export default function FiltroMultiplo({
  rotulo,
  opcoes,
  selecionados,
  onChange,
}: {
  rotulo: string;
  opcoes: { valor: string; rotulo: string }[];
  selecionados: Set<string>;
  onChange: (novo: Set<string>) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  function alternar(valor: string) {
    const novo = new Set(selecionados);
    if (novo.has(valor)) novo.delete(valor);
    else novo.add(valor);
    onChange(novo);
  }

  const textoBotao = selecionados.size === 0 ? `Todos os ${rotulo.toLowerCase()}` : `${rotulo} (${selecionados.size})`;

  return (
    <div className="filtro-multiplo" ref={ref}>
      <button type="button" className="filtro-multiplo-botao" onClick={() => setAberto((a) => !a)}>
        {textoBotao}
        <span className="filtro-multiplo-seta">▾</span>
      </button>
      {aberto && (
        <div className="filtro-multiplo-painel">
          {selecionados.size > 0 && (
            <button type="button" className="link-botao filtro-multiplo-limpar" onClick={() => onChange(new Set())}>
              Limpar seleção
            </button>
          )}
          {opcoes.map((o) => (
            <label key={o.valor} className="filtro-multiplo-item">
              <input type="checkbox" checked={selecionados.has(o.valor)} onChange={() => alternar(o.valor)} />
              {o.rotulo}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

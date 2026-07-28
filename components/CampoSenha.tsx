"use client";

import { useState, InputHTMLAttributes, ChangeEvent } from "react";

function IconeOlho() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconeOlhoFechado() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <path d="m2 2 20 20" />
    </svg>
  );
}

type CampoSenhaProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> & {
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
};

// Campo de senha com botão de olho embutido pra mostrar/ocultar o texto
// digitado — cada instância tem seu próprio estado, então vários campos na
// mesma tela alternam de forma independente.
export default function CampoSenha({ value, onChange, ...resto }: CampoSenhaProps) {
  const [visivel, setVisivel] = useState(false);
  return (
    <div className="campo-senha">
      <input {...resto} type={visivel ? "text" : "password"} value={value} onChange={onChange} />
      <button
        type="button"
        className="campo-senha-olho"
        onClick={() => setVisivel((v) => !v)}
        tabIndex={-1}
        aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
        title={visivel ? "Ocultar senha" : "Mostrar senha"}
      >
        {visivel ? <IconeOlhoFechado /> : <IconeOlho />}
      </button>
    </div>
  );
}

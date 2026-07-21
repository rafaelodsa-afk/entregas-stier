"use client";

import { useEffect, useState } from "react";

const CHAVE_TEMA = "stier-theme";

function SolIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function LuaIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function aplicarCorDeStatusBar(tema: "light" | "dark") {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", tema === "light" ? "#eef0f3" : "#0b0d0f");
}

export default function ThemeToggle({ className = "" }: { className?: string }) {
  // Padrão escuro sempre — só reflete o que já estiver aplicado no <html>
  // (que o script de bootstrap no layout já decidiu antes da hidratação).
  const [tema, setTema] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const atual = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
    setTema(atual);
  }, []);

  function alternar() {
    const novo: "light" | "dark" = tema === "dark" ? "light" : "dark";
    if (novo === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    localStorage.setItem(CHAVE_TEMA, novo);
    aplicarCorDeStatusBar(novo);
    setTema(novo);
  }

  const proximo = tema === "dark" ? "claro" : "escuro";

  return (
    <button
      className={`btn-ghost btn-tema ${className}`.trim()}
      onClick={alternar}
      title={`Mudar para modo ${proximo}`}
      aria-label={`Mudar para modo ${proximo}`}
    >
      {tema === "dark" ? <SolIcon /> : <LuaIcon />}
    </button>
  );
}

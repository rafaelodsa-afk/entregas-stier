"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RefreshButton() {
  const router = useRouter();
  const [girando, setGirando] = useState(false);

  function atualizar() {
    setGirando(true);
    router.refresh();
    setTimeout(() => setGirando(false), 500);
  }

  return (
    <button
      className="btn-ghost btn-atualizar"
      onClick={atualizar}
      title="Atualizar dados desta tela"
      aria-label="Atualizar dados desta tela"
    >
      <svg
        className={girando ? "icone-girando" : ""}
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <polyline points="21 3 21 9 15 9" />
      </svg>
    </button>
  );
}

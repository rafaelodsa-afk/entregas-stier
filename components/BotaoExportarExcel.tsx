"use client";

import { useState } from "react";

function IconePlanilha() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v5h6" />
      <path d="M8 13h8" />
      <path d="M8 17h8" />
    </svg>
  );
}

/**
 * Baixa a planilha formatada. Quando recebe "ids", manda só esses pedidos —
 * é assim que a exportação sai igual ao que está na tela (filtro ou seleção),
 * em vez de despejar a base inteira.
 */
export default function BotaoExportarExcel({
  tipo,
  ids,
  rotulo = "Exportar Excel",
  titulo,
}: {
  tipo: "pedidos" | "financeiro";
  ids?: string[];
  rotulo?: string;
  titulo?: string;
}) {
  const [baixando, setBaixando] = useState(false);
  const [erro, setErro] = useState("");

  async function exportar() {
    setBaixando(true);
    setErro("");
    try {
      const res = await fetch("/api/relatorios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, ids: ids && ids.length > 0 ? ids : undefined }),
      });
      if (!res.ok) {
        const dados = await res.json().catch(() => ({}));
        setErro(dados.erro || "Não foi possível gerar a planilha.");
        return;
      }
      // Pega o nome que o servidor sugeriu, pra manter a data no arquivo.
      const cabecalho = res.headers.get("Content-Disposition") ?? "";
      const casado = cabecalho.match(/filename="([^"]+)"/);
      const nome = casado?.[1] ?? `relatorio_${tipo}.xlsx`;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = nome;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Libera a memória do blob depois que o download começou.
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      console.error(e);
      setErro("Erro de conexão ao gerar a planilha.");
    } finally {
      setBaixando(false);
    }
  }

  return (
    <>
      <button className="btn-ghost" disabled={baixando} onClick={exportar} title={titulo}>
        {baixando ? "Gerando planilha..." : rotulo}
        {!baixando && <IconePlanilha />}
      </button>
      {erro && <span className="erro">{erro}</span>}
    </>
  );
}

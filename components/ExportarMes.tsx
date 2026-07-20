"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function formatarMes(chave: string) {
  const [ano, mes] = chave.split("-");
  return `${mes}/${ano}`;
}

export default function ExportarMes({ meses }: { meses: string[] }) {
  const [mesSelecionado, setMesSelecionado] = useState(meses[meses.length - 1] ?? "");
  const [baixando, setBaixando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const router = useRouter();

  async function baixar() {
    if (!mesSelecionado) return;
    setBaixando(true);
    setErro("");
    setSucesso("");
    try {
      const res = await fetch("/api/armazenamento/exportar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mes: mesSelecionado }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErro(data.erro || "Não foi possível gerar o arquivo.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `stier-pedidos-${mesSelecionado}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setSucesso(`Arquivo de ${formatarMes(mesSelecionado)} baixado com sucesso.`);
      router.refresh();
    } catch (err) {
      console.error(err);
      setErro("Erro de conexão.");
    } finally {
      setBaixando(false);
    }
  }

  if (meses.length === 0) {
    return null;
  }

  return (
    <div className="form-card">
      <h2>Exportar pedidos de um mês</h2>
      <p className="page-sub" style={{ marginBottom: 12 }}>
        Gera um .zip com a planilha completa (todos os dados + histórico), todos os canhotos e comprovantes de
        pagamento daquele mês, e um LEIA-ME.txt com o resumo.
      </p>
      <div className="canhoto-upload">
        <select value={mesSelecionado} onChange={(e) => setMesSelecionado(e.target.value)} className="filtro-transportador">
          {meses.map((m) => (
            <option key={m} value={m}>
              {formatarMes(m)}
            </option>
          ))}
        </select>
        <button className="btn-importar" onClick={baixar} disabled={!mesSelecionado || baixando}>
          {baixando ? "Gerando arquivo..." : "Baixar arquivo desse mês"}
        </button>
      </div>
      {erro && <p className="erro" style={{ marginTop: 10 }}>{erro}</p>}
      {sucesso && (
        <p className="erro" style={{ background: "rgba(63,191,143,0.12)", borderColor: "rgba(63,191,143,0.4)", color: "#8fe3c4" }}>
          {sucesso}
        </p>
      )}
    </div>
  );
}

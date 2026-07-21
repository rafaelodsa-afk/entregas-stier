"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

function formatarMes(chave: string) {
  const [ano, mes] = chave.split("-");
  return `${mes}/${ano}`;
}

function formatarGB(bytes: number) {
  return (bytes / (1024 * 1024 * 1024)).toFixed(3) + " GB";
}

type Resumo = {
  totalPedidos: number;
  totalCanhotos: number;
  totalComprovantes: number;
  totalArquivos: number;
  totalBytes: number;
};

export default function ExcluirMes({ mesesExportados }: { mesesExportados: string[] }) {
  const [mesSelecionado, setMesSelecionado] = useState(mesesExportados[0] ?? "");
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [carregandoResumo, setCarregandoResumo] = useState(false);
  const [confirmacaoTexto, setConfirmacaoTexto] = useState("");
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const router = useRouter();

  useEffect(() => {
    if (!mesSelecionado) {
      setResumo(null);
      return;
    }
    setCarregandoResumo(true);
    setResumo(null);
    setConfirmacaoTexto("");
    setErro("");
    fetch("/api/armazenamento/resumo-mes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mes: mesSelecionado }),
    })
      .then((r) => r.json())
      .then((data) => setResumo(data))
      .catch(() => setErro("Não foi possível calcular o resumo."))
      .finally(() => setCarregandoResumo(false));
  }, [mesSelecionado]);

  const confirmacaoValida = Boolean(mesSelecionado) && confirmacaoTexto.trim() === formatarMes(mesSelecionado);

  async function excluir() {
    if (!confirmacaoValida || !mesSelecionado || !resumo) return;

    setExcluindo(true);
    setErro("");
    setSucesso("");
    try {
      const res = await fetch("/api/armazenamento/excluir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mes: mesSelecionado, confirmacaoMes: mesSelecionado }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(data.erro || "Não foi possível excluir.");
        return;
      }
      setSucesso(
        `${data.totalPedidos} pedido(s) e ${data.totalArquivos} arquivo(s) de ${formatarMes(mesSelecionado)} foram excluídos permanentemente.`
      );
      setMesSelecionado("");
      setResumo(null);
      setConfirmacaoTexto("");
      router.refresh();
    } catch (err) {
      console.error(err);
      setErro("Erro de conexão.");
    } finally {
      setExcluindo(false);
    }
  }

  if (mesesExportados.length === 0) {
    return (
      <div className="form-card">
        <h2>Excluir pedidos de um mês</h2>
        <p className="muted">Nenhum mês foi exportado ainda — exporte um mês (acima) antes de poder excluí-lo.</p>
      </div>
    );
  }

  return (
    <div className="form-card" style={{ borderColor: "rgba(225,92,74,0.4)" }}>
      <h2>Excluir pedidos de um mês</h2>
      <p className="page-sub" style={{ marginBottom: 12 }}>
        Só é possível excluir meses que já foram exportados (seção acima) pelo menos uma vez.
      </p>
      <div className="canhoto-upload">
        <select value={mesSelecionado} onChange={(e) => setMesSelecionado(e.target.value)} className="filtro-transportador">
          {mesesExportados.map((m) => (
            <option key={m} value={m}>
              {formatarMes(m)}
            </option>
          ))}
        </select>
      </div>

      {carregandoResumo && <p className="muted" style={{ marginTop: 10 }}>Calculando...</p>}

      {resumo && (
        <div style={{ marginTop: 14 }}>
          <p>Isso vai apagar, para sempre:</p>
          <ul className="resumo-categorias">
            <li><strong>{resumo.totalPedidos}</strong> pedido(s)</li>
            <li><strong>{resumo.totalCanhotos}</strong> canhoto(s)</li>
            <li><strong>{resumo.totalComprovantes}</strong> comprovante(s)</li>
            <li><strong>{formatarGB(resumo.totalBytes)}</strong> de espaço liberado</li>
          </ul>

          <p className="erro" style={{ marginTop: 12, background: "rgba(225,92,74,0.1)", borderColor: "rgba(225,92,74,0.4)" }}>
            Confirme que o arquivo baixado abre corretamente e está salvo em pelo menos dois lugares (ex:
            computador + nuvem) antes de excluir — essa ação não pode ser desfeita.
          </p>

          <label style={{ display: "block", marginTop: 12 }}>
            Digite <strong>{formatarMes(mesSelecionado)}</strong> pra confirmar
            <input
              value={confirmacaoTexto}
              onChange={(e) => setConfirmacaoTexto(e.target.value)}
              placeholder={formatarMes(mesSelecionado)}
              className="confirmacao-exclusao-input"
            />
          </label>

          <button
            disabled={!confirmacaoValida || excluindo}
            onClick={excluir}
            className="btn-excluir-mes"
            style={{ marginTop: 12 }}
          >
            {excluindo ? "Excluindo..." : `Excluir pedidos de ${formatarMes(mesSelecionado)} definitivamente`}
          </button>
        </div>
      )}

      {erro && <p className="erro" style={{ marginTop: 10 }}>{erro}</p>}
      {sucesso && (
        <p className="erro" style={{ background: "rgba(63,191,143,0.12)", borderColor: "rgba(63,191,143,0.4)", color: "var(--teal)", marginTop: 10 }}>
          {sucesso}
        </p>
      )}
    </div>
  );
}

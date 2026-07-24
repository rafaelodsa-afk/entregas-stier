"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AlertaProblemaPedido({
  pedidoId,
  ativo,
  observacao,
  podeResolver = false,
}: {
  pedidoId: string;
  ativo: boolean;
  observacao: string | null;
  podeResolver?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const router = useRouter();

  if (!observacao) return null;

  async function resolver() {
    setCarregando(true);
    setErro("");
    try {
      const res = await fetch(`/api/pedidos/${pedidoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "resolverAlertaProblema" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErro(data.erro || "Não foi possível resolver o alerta.");
        return;
      }
      setAberto(false);
      router.refresh();
    } catch {
      setErro("Erro de conexão.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn-ghost"
        style={{
          padding: "3px 7px",
          marginLeft: 6,
          color: ativo ? "var(--orange)" : "var(--muted)",
          borderColor: ativo ? "rgba(240, 136, 62, 0.4)" : undefined,
        }}
        title={ativo ? "Problema sinalizado pelo transportador — clique pra ver" : "Alerta resolvido — clique pra ver a observação"}
        onClick={() => setAberto(true)}
      >
        !
      </button>
      {aberto && (
        // Modal centralizado (em vez de um dropdown ancorado no botão) pra
        // nunca ficar cortado por outras linhas da tabela, não importa a
        // posição do pedido na lista.
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={() => setAberto(false)}
        >
          <div className="form-card" style={{ maxWidth: 360, width: "100%", margin: 0 }} onClick={(e) => e.stopPropagation()}>
            <p className="muted" style={{ margin: "0 0 4px", fontSize: 11, textTransform: "uppercase" }}>
              {ativo ? "Problema sinalizado" : "Observação (resolvido)"}
            </p>
            <p style={{ margin: "0 0 14px", fontSize: 13.5 }}>{observacao}</p>
            {erro && <p className="erro" style={{ marginBottom: 10 }}>{erro}</p>}
            <div className="acoes-linha">
              {ativo && podeResolver && (
                <button disabled={carregando} onClick={resolver}>
                  {carregando ? "..." : "Marcar como resolvido"}
                </button>
              )}
              <button type="button" className="btn-ghost" onClick={() => setAberto(false)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

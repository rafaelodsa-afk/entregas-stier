"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Pedido = {
  id: string;
  statusEntrega: string;
  statusFinanceiro: string;
};

const LABEL_STATUS: Record<string, string> = {
  AGUARDANDO_ACEITE: "Aguardando aceite",
  AGUARDANDO_CARREGAMENTO: "Aguardando carregamento",
  EM_ROTA: "Em rota de entrega",
  ENTREGUE: "Entregue",
  REENTREGA: "Reentrega",
  CANCELADO: "Cancelado",
  DEVOLVIDO: "Devolvido",
};

export function BadgeStatus({ status }: { status: string }) {
  return <span className="badge">{LABEL_STATUS[status] ?? status}</span>;
}

export default function PedidoAcoes({ pedido, isAdmin = false }: { pedido: Pedido; isAdmin?: boolean }) {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const router = useRouter();

  async function acao(payload: Record<string, any>) {
    setCarregando(true);
    setErro("");
    try {
      const res = await fetch(`/api/pedidos/${pedido.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErro(data.erro || "Não foi possível atualizar.");
        return;
      }
      router.refresh();
    } catch (err) {
      console.error(err);
      setErro("Erro de conexão.");
    } finally {
      setCarregando(false);
    }
  }

  if (isAdmin) {
    return (
      <div className="acoes">
        {pedido.statusFinanceiro === "AGUARDANDO_ACERTO" && (
          <button disabled={carregando} onClick={() => acao({ acao: "confirmarAcerto" })}>
            Confirmar acerto
          </button>
        )}
        {erro && <p className="erro" style={{ marginTop: 6 }}>{erro}</p>}
      </div>
    );
  }

  return (
    <div className="pedido-actions">
      {pedido.statusEntrega === "AGUARDANDO_ACEITE" && (
        <button disabled={carregando} onClick={() => acao({ acao: "avancarStatus", statusEntrega: "AGUARDANDO_CARREGAMENTO" })}>
          Aceitar pedido
        </button>
      )}
      {pedido.statusEntrega === "AGUARDANDO_CARREGAMENTO" && (
        <button disabled={carregando} onClick={() => acao({ acao: "avancarStatus", statusEntrega: "EM_ROTA" })}>
          Iniciar rota
        </button>
      )}
      {pedido.statusEntrega === "EM_ROTA" && (
        <button disabled={carregando} onClick={() => acao({ acao: "finalizarEntrega" })}>
          Finalizar entrega
        </button>
      )}
      {erro && <p className="erro" style={{ marginTop: 6, width: "100%" }}>{erro}</p>}
    </div>
  );
}

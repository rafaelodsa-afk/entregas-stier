"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";

type Pedido = {
  id: string;
  statusEntrega: string;
  statusFinanceiro: string;
  canhotoUrl?: string | null;
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

async function enviarAcao(pedidoId: string, payload: Record<string, any>) {
  const res = await fetch(`/api/pedidos/${pedidoId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.erro || "Não foi possível atualizar.");
  }
}

export default function PedidoAcoes({ pedido, isAdmin = false }: { pedido: Pedido; isAdmin?: boolean }) {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [canhoto, setCanhoto] = useState<File | null>(null);
  const router = useRouter();

  async function acaoSimples(payload: Record<string, any>) {
    setCarregando(true);
    setErro("");
    try {
      await enviarAcao(pedido.id, payload);
      router.refresh();
    } catch (err: any) {
      setErro(err.message || "Erro de conexão.");
    } finally {
      setCarregando(false);
    }
  }

  async function finalizarComCanhoto() {
    if (!canhoto) {
      setErro("Selecione a foto ou PDF do canhoto antes de finalizar.");
      return;
    }
    setCarregando(true);
    setErro("");
    try {
      const blob = await upload(`canhotos/pedido-${pedido.id}-${Date.now()}-${canhoto.name}`, canhoto, {
        access: "public",
        handleUploadUrl: "/api/upload",
      });
      await enviarAcao(pedido.id, {
        acao: "finalizarEntrega",
        canhotoUrl: blob.url,
        canhotoTipo: canhoto.type.startsWith("image/") ? "foto" : "pdf",
      });
      router.refresh();
    } catch (err: any) {
      console.error(err);
      setErro(err.message || "Não foi possível enviar o canhoto.");
    } finally {
      setCarregando(false);
    }
  }

  if (isAdmin) {
    return (
      <div className="acoes">
        {pedido.statusFinanceiro === "AGUARDANDO_ACERTO" && (
          <button disabled={carregando} onClick={() => acaoSimples({ acao: "confirmarAcerto" })}>
            Confirmar acerto
          </button>
        )}
        {pedido.canhotoUrl && (
          <a className="link-canhoto" href={pedido.canhotoUrl} target="_blank" rel="noreferrer">
            Ver canhoto
          </a>
        )}
        {erro && <p className="erro" style={{ marginTop: 6 }}>{erro}</p>}
      </div>
    );
  }

  return (
    <div className="pedido-actions">
      {pedido.statusEntrega === "AGUARDANDO_ACEITE" && (
        <button disabled={carregando} onClick={() => acaoSimples({ acao: "avancarStatus", statusEntrega: "AGUARDANDO_CARREGAMENTO" })}>
          Aceitar pedido
        </button>
      )}
      {pedido.statusEntrega === "AGUARDANDO_CARREGAMENTO" && (
        <button disabled={carregando} onClick={() => acaoSimples({ acao: "avancarStatus", statusEntrega: "EM_ROTA" })}>
          Iniciar rota
        </button>
      )}
      {pedido.statusEntrega === "EM_ROTA" && (
        <div className="canhoto-upload">
          <label className="canhoto-input-label">
            {canhoto ? canhoto.name : "Escolher foto/PDF do canhoto"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => setCanhoto(e.target.files?.[0] ?? null)}
              hidden
            />
          </label>
          <button disabled={carregando || !canhoto} onClick={finalizarComCanhoto}>
            {carregando ? "Enviando..." : "Finalizar entrega"}
          </button>
        </div>
      )}
      {erro && <p className="erro" style={{ marginTop: 6, width: "100%" }}>{erro}</p>}
    </div>
  );
}

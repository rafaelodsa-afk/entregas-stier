"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { comprimirImagem } from "@/lib/comprimirImagem";
import { LABEL_STATUS, CLASSE_BADGE } from "@/lib/statusLabels";

export { LABEL_STATUS };

type Pedido = {
  id: string;
  statusEntrega: string;
  statusFinanceiro: string;
  statusPlanilha?: string | null;
  canhotoUrl?: string | null;
  comprovantePagamentoUrl?: string | null;
};

// Só não dá pra anexar canhoto quando o pedido já chegou num desses estados finais.
const STATUS_SEM_CANHOTO = ["ENTREGUE", "CANCELADO"];

export function BadgeStatus({ status, statusPlanilha }: { status: string; statusPlanilha?: string | null }) {
  return (
    <span>
      <span className={`badge ${CLASSE_BADGE[status] ?? ""}`}>{LABEL_STATUS[status] ?? status}</span>
      {statusPlanilha && <div className="status-planilha-info">Planilha: {statusPlanilha}</div>}
    </span>
  );
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
  const [comprovante, setComprovante] = useState<File | null>(null);
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

  async function anexarCanhoto() {
    if (!canhoto) {
      setErro("Selecione a foto ou PDF do canhoto.");
      return;
    }
    setCarregando(true);
    setErro("");
    try {
      const arquivo = await comprimirImagem(canhoto);
      const blob = await upload(`canhotos/pedido-${pedido.id}-${Date.now()}-${arquivo.name}`, arquivo, {
        access: "public",
        handleUploadUrl: "/api/upload",
      });
      await enviarAcao(pedido.id, {
        acao: "finalizarEntrega",
        canhotoUrl: blob.url,
        canhotoTipo: arquivo.type.startsWith("image/") ? "foto" : "pdf",
      });
      setCanhoto(null);
      router.refresh();
    } catch (err: any) {
      console.error(err);
      setErro(err.message || "Não foi possível enviar o canhoto.");
    } finally {
      setCarregando(false);
    }
  }

  async function anexarComprovante() {
    if (!comprovante) {
      setErro("Selecione a foto ou PDF do comprovante de pagamento.");
      return;
    }
    setCarregando(true);
    setErro("");
    try {
      const arquivo = await comprimirImagem(comprovante);
      const blob = await upload(`comprovantes-pagamento/pedido-${pedido.id}-${Date.now()}-${arquivo.name}`, arquivo, {
        access: "public",
        handleUploadUrl: "/api/upload",
      });
      await enviarAcao(pedido.id, {
        acao: "anexarComprovantePagamento",
        comprovanteUrl: blob.url,
        comprovanteTipo: arquivo.type.startsWith("image/") ? "foto" : "pdf",
      });
      setComprovante(null);
      router.refresh();
    } catch (err: any) {
      console.error(err);
      setErro(err.message || "Não foi possível enviar o comprovante.");
    } finally {
      setCarregando(false);
    }
  }

  const podeAnexarCanhoto = !STATUS_SEM_CANHOTO.includes(pedido.statusEntrega);
  const podeAnexarComprovante = pedido.statusFinanceiro === "AGUARDANDO_ACERTO";

  const blocoCanhoto = podeAnexarCanhoto ? (
    <div className="canhoto-upload">
      <label className="canhoto-input-label">
        {canhoto ? canhoto.name : "Anexar canhoto (foto/PDF)"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          capture="environment"
          onChange={(e) => setCanhoto(e.target.files?.[0] ?? null)}
          hidden
        />
      </label>
      <button disabled={carregando || !canhoto} onClick={anexarCanhoto}>
        {carregando
          ? "Enviando..."
          : pedido.statusEntrega === "AGUARDANDO_CANHOTO"
            ? "Anexar canhoto e finalizar"
            : "Anexar e marcar como entregue"}
      </button>
    </div>
  ) : null;

  const blocoComprovante = podeAnexarComprovante ? (
    <div className="canhoto-upload">
      <label className="canhoto-input-label">
        {comprovante ? comprovante.name : "Anexar comprovante de pagamento"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          capture="environment"
          onChange={(e) => setComprovante(e.target.files?.[0] ?? null)}
          hidden
        />
      </label>
      <button disabled={carregando || !comprovante} onClick={anexarComprovante}>
        {carregando ? "Enviando..." : "Anexar comprovante"}
      </button>
    </div>
  ) : null;

  const linkCanhoto = pedido.canhotoUrl ? (
    <a className="link-canhoto" href={pedido.canhotoUrl} target="_blank" rel="noreferrer">
      Ver canhoto
    </a>
  ) : null;

  const linkComprovante = pedido.comprovantePagamentoUrl ? (
    <a className="link-canhoto" href={pedido.comprovantePagamentoUrl} target="_blank" rel="noreferrer">
      Ver comprovante de pagamento
    </a>
  ) : null;

  if (isAdmin) {
    return (
      <div className="acoes">
        {pedido.statusFinanceiro === "AGUARDANDO_ACERTO" && (
          <button disabled={carregando} onClick={() => acaoSimples({ acao: "confirmarAcerto" })}>
            Confirmar acerto
          </button>
        )}
        {linkCanhoto}
        {linkComprovante}
        {blocoCanhoto}
        {blocoComprovante}
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
      {blocoCanhoto}
      {linkCanhoto}
      {blocoComprovante}
      {linkComprovante}
      {erro && <p className="erro" style={{ marginTop: 6, width: "100%" }}>{erro}</p>}
    </div>
  );
}

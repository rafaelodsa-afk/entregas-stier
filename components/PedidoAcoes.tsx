"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { comprimirImagem } from "@/lib/comprimirImagem";
import { enviarArquivoParaR2 } from "@/lib/uploadR2Client";
import { LABEL_STATUS, CLASSE_BADGE } from "@/lib/statusLabels";

export { LABEL_STATUS };

type Pedido = {
  id: string;
  statusEntrega: string;
  statusFinanceiro: string;
  statusPlanilha?: string | null;
  canhotoUrl?: string | null;
  comprovantePagamentoUrl?: string | null;
  finalizadoSemCanhoto?: boolean;
};

// Só não dá pra anexar canhoto quando o pedido já chegou num desses estados finais.
const STATUS_SEM_CANHOTO = ["ENTREGUE", "CANCELADO"];

export function BadgeStatus({
  status,
  statusPlanilha,
  finalizadoSemCanhoto,
}: {
  status: string;
  statusPlanilha?: string | null;
  finalizadoSemCanhoto?: boolean;
}) {
  const semComprovante = status === "ENTREGUE" && finalizadoSemCanhoto;
  const classe = semComprovante ? "badge-sem-comprovante" : CLASSE_BADGE[status] ?? "";
  const rotulo = semComprovante ? "Entregue (sem comprovante)" : LABEL_STATUS[status] ?? status;
  return (
    <span>
      <span className={`badge ${classe}`}>{rotulo}</span>
      {statusPlanilha && <div className="status-planilha-info">Planilha: {statusPlanilha}</div>}
    </span>
  );
}

export async function enviarAcao(pedidoId: string, payload: Record<string, any>) {
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

export default function PedidoAcoes({
  pedido,
  isAdmin = false,
  podeFinalizarLegado = false,
}: {
  pedido: Pedido;
  isAdmin?: boolean;
  podeFinalizarLegado?: boolean;
}) {
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
      const { key, tipo } = await enviarArquivoParaR2(arquivo, "canhotos", pedido.id);
      await enviarAcao(pedido.id, {
        acao: "finalizarEntrega",
        canhotoUrl: key,
        canhotoTipo: tipo,
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
      const { key, tipo } = await enviarArquivoParaR2(arquivo, "comprovantes-pagamento", pedido.id);
      await enviarAcao(pedido.id, {
        acao: "anexarComprovantePagamento",
        comprovanteUrl: key,
        comprovanteTipo: tipo,
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

  async function finalizarSemComprovante() {
    const justificativa = window.prompt(
      'Justificativa (obrigatória) — ex: "Pedido anterior à implantação do sistema":',
      "Pedido anterior à implantação do sistema"
    );
    if (justificativa === null) return;
    if (!justificativa.trim()) {
      setErro("Informe uma justificativa pra finalizar sem comprovante.");
      return;
    }
    if (!window.confirm(`Marcar o pedido #${pedido.id} como entregue SEM comprovante? Isso fica registrado permanentemente no histórico.`)) {
      return;
    }
    await acaoSimples({ acao: "finalizarSemComprovante", justificativa: justificativa.trim() });
  }

  const podeAnexarCanhoto = !STATUS_SEM_CANHOTO.includes(pedido.statusEntrega);
  const podeAnexarComprovante = pedido.statusFinanceiro === "AGUARDANDO_ACERTO";

  const blocoCanhoto = podeAnexarCanhoto ? (
    <div className="canhoto-upload">
      <div className="canhoto-opcoes">
        <label className="canhoto-input-label">
          Tirar foto
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={(e) => setCanhoto(e.target.files?.[0] ?? null)}
            hidden
          />
        </label>
        <label className="canhoto-input-label">
          Escolher da galeria
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => setCanhoto(e.target.files?.[0] ?? null)}
            hidden
          />
        </label>
      </div>
      {canhoto && <span className="canhoto-arquivo-nome">{canhoto.name}</span>}
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
      <div className="canhoto-opcoes">
        <label className="canhoto-input-label">
          Tirar foto
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={(e) => setComprovante(e.target.files?.[0] ?? null)}
            hidden
          />
        </label>
        <label className="canhoto-input-label">
          Escolher da galeria
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => setComprovante(e.target.files?.[0] ?? null)}
            hidden
          />
        </label>
      </div>
      {comprovante && <span className="canhoto-arquivo-nome">{comprovante.name}</span>}
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
        {podeFinalizarLegado && podeAnexarCanhoto && (
          <button className="btn-legado" disabled={carregando} onClick={finalizarSemComprovante}>
            Marcar como entregue sem comprovante (pedido legado)
          </button>
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
      {blocoCanhoto}
      {linkCanhoto}
      {blocoComprovante}
      {linkComprovante}
      {erro && <p className="erro" style={{ marginTop: 6, width: "100%" }}>{erro}</p>}
    </div>
  );
}

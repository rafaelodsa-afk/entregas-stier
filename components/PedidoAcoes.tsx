"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { comprimirImagem } from "@/lib/comprimirImagem";
import { enviarArquivoParaR2 } from "@/lib/uploadR2Client";
import { LABEL_STATUS, CLASSE_BADGE } from "@/lib/statusLabels";
import AlertaProblemaPedido from "@/components/AlertaProblemaPedido";

function IconeAlertaTriangulo() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

export { LABEL_STATUS };

type Pedido = {
  id: string;
  statusEntrega: string;
  statusFinanceiro: string;
  statusPlanilha?: string | null;
  canhotoUrl?: string | null;
  comprovantePagamentoUrl?: string | null;
  finalizadoSemCanhoto?: boolean;
  alertaProblema?: boolean;
  alertaProblemaObservacao?: string | null;
};

// Só não dá pra anexar canhoto quando o pedido já chegou num desses estados finais.
export const STATUS_SEM_CANHOTO = ["ENTREGUE", "CANCELADO"];

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

  async function relatarProblema() {
    const observacao = window.prompt(
      "Descreva o problema (obrigatório) — isso é só um alerta, não muda o status do pedido:"
    );
    if (observacao === null) return;
    if (!observacao.trim()) {
      setErro("Descreva o problema pra sinalizar.");
      return;
    }
    await acaoSimples({ acao: "sinalizarProblema", observacao: observacao.trim() });
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

  // Além dos status finais, também não dá pra anexar canhoto antes do
  // transportador aceitar o pedido — a API bloqueia isso de verdade também.
  const podeAnexarCanhoto =
    pedido.statusEntrega !== "AGUARDANDO_ACEITE" && !STATUS_SEM_CANHOTO.includes(pedido.statusEntrega);
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
        {pedido.statusEntrega === "AGUARDANDO_ACEITE" && (
          <button disabled={carregando} onClick={() => acaoSimples({ acao: "aceitarPeloTransportador" })}>
            Aceitar pelo transportador
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
      {!STATUS_SEM_CANHOTO.includes(pedido.statusEntrega) && (
        pedido.alertaProblema ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span className="muted">Problema sinalizado — aguardando revisão da Stier</span>
            <AlertaProblemaPedido pedidoId={pedido.id} ativo={pedido.alertaProblema} observacao={pedido.alertaProblemaObservacao ?? null} />
          </span>
        ) : (
          <button className="btn-relatar-problema" disabled={carregando} onClick={relatarProblema}>
            Reportar problema
            <IconeAlertaTriangulo />
          </button>
        )
      )}
      {erro && <p className="erro" style={{ marginTop: 6, width: "100%" }}>{erro}</p>}
    </div>
  );
}

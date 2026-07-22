"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PedidoAcoes, { BadgeStatus, LABEL_STATUS, enviarAcao } from "@/components/PedidoAcoes";
import IconeDinheiro from "@/components/IconeDinheiro";

type Pedido = {
  id: string;
  cliente: string;
  cidade: string;
  bairro: string;
  rua: string;
  numero: string;
  valorPedido: number;
  statusEntrega: string;
  statusFinanceiro: string;
  statusPlanilha: string | null;
  canhotoUrl: string | null;
  comprovantePagamentoUrl: string | null;
  finalizadoSemCanhoto: boolean;
  mostraIconeDinheiro: boolean;
};

// Únicos status em que uma ação em lote se aplica — nunca leva um pedido
// direto pra "Entregue" (isso sempre exige anexar canhoto individualmente).
const STATUS_LOTE: Record<string, { proximo: string; rotuloUm: string; rotuloVarios: string }> = {
  AGUARDANDO_ACEITE: { proximo: "AGUARDANDO_CARREGAMENTO", rotuloUm: "Aceitar pedido", rotuloVarios: "Aceitar" },
  AGUARDANDO_CARREGAMENTO: { proximo: "EM_ROTA", rotuloUm: "Iniciar rota", rotuloVarios: "Iniciar rota nos" },
};

export default function ListaPedidosOperador({ pedidos }: { pedidos: Pedido[] }) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [processando, setProcessando] = useState(false);
  const [erroLote, setErroLote] = useState("");

  const buscaNormalizada = busca.trim().toLowerCase();
  const filtrados = pedidos.filter((p) => {
    if (statusFiltro && p.statusEntrega !== statusFiltro) return false;
    if (buscaNormalizada) {
      const alvo = `${p.id} ${p.cliente}`.toLowerCase();
      if (!alvo.includes(buscaNormalizada)) return false;
    }
    return true;
  });

  const aguardandoAceite = filtrados.filter((p) => p.statusEntrega === "AGUARDANDO_ACEITE");
  const aguardandoCarregamento = filtrados.filter((p) => p.statusEntrega === "AGUARDANDO_CARREGAMENTO");
  const elegiveisLote = filtrados.filter((p) => p.statusEntrega in STATUS_LOTE);

  const statusDosSelecionados = useMemo(() => {
    const statusUnicos = new Set([...selecionados].map((id) => pedidos.find((p) => p.id === id)?.statusEntrega));
    return statusUnicos.size === 1 ? [...statusUnicos][0] : null;
  }, [selecionados, pedidos]);

  function alternarSelecao(id: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function alternarSelecionarTodos() {
    const idsElegiveis = elegiveisLote.map((p) => p.id);
    const todosJaSelecionados = idsElegiveis.length > 0 && idsElegiveis.every((id) => selecionados.has(id));
    setSelecionados(todosJaSelecionados ? new Set() : new Set(idsElegiveis));
  }

  async function executarLote(ids: string[], statusOrigem: string) {
    const alvo = STATUS_LOTE[statusOrigem];
    if (!alvo || ids.length === 0) return;
    setProcessando(true);
    setErroLote("");
    try {
      const resultados = await Promise.allSettled(
        ids.map((id) => enviarAcao(id, { acao: "avancarStatus", statusEntrega: alvo.proximo }))
      );
      const falhas = resultados.filter((r) => r.status === "rejected").length;
      if (falhas > 0) {
        setErroLote(`${falhas} de ${ids.length} pedido(s) não puderam ser atualizados. Tente novamente.`);
      }
      setSelecionados(new Set());
      router.refresh();
    } finally {
      setProcessando(false);
    }
  }

  const acaoSelecao = statusDosSelecionados ? STATUS_LOTE[statusDosSelecionados] : null;

  return (
    <div>
      <div className="filtros-pedidos">
        <input
          type="text"
          placeholder="Buscar por nº do pedido ou cliente..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="busca-pedidos"
        />
        <select value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)} className="filtro-transportador">
          <option value="">Todos os status</option>
          {Object.entries(LABEL_STATUS).map(([valor, label]) => (
            <option key={valor} value={valor}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {(aguardandoAceite.length > 0 || aguardandoCarregamento.length > 0) && (
        <div className="lote-topo">
          {elegiveisLote.length > 0 && (
            <label className="lote-selecionar-todos">
              <input
                type="checkbox"
                checked={elegiveisLote.every((p) => selecionados.has(p.id))}
                onChange={alternarSelecionarTodos}
              />
              Selecionar todos
            </label>
          )}
          {aguardandoAceite.length > 0 && (
            <button
              className="btn-ghost"
              disabled={processando}
              onClick={() => executarLote(aguardandoAceite.map((p) => p.id), "AGUARDANDO_ACEITE")}
            >
              Aceitar todos os pendentes ({aguardandoAceite.length})
            </button>
          )}
          {aguardandoCarregamento.length > 0 && (
            <button
              className="btn-ghost"
              disabled={processando}
              onClick={() => executarLote(aguardandoCarregamento.map((p) => p.id), "AGUARDANDO_CARREGAMENTO")}
            >
              Iniciar rota em todos ({aguardandoCarregamento.length})
            </button>
          )}
        </div>
      )}

      {selecionados.size > 0 && (
        <div className="lote-barra">
          <span>{selecionados.size} selecionado(s)</span>
          {acaoSelecao ? (
            <button
              disabled={processando}
              onClick={() => executarLote([...selecionados], statusDosSelecionados!)}
            >
              {processando
                ? "Processando..."
                : `${acaoSelecao.rotuloVarios} selecionados (${selecionados.size})`}
            </button>
          ) : (
            <span className="muted">Selecione pedidos com o mesmo status pra agir em lote</span>
          )}
          <button className="link-botao" onClick={() => setSelecionados(new Set())}>
            Limpar seleção
          </button>
        </div>
      )}
      {erroLote && <p className="erro" style={{ marginBottom: 12 }}>{erroLote}</p>}

      <div className="pedido-list">
        {filtrados.length === 0 && <p className="muted">Nenhum pedido encontrado.</p>}
        {filtrados.map((p) => (
          <div key={p.id} className="pedido-card">
            <div className="pedido-card-top">
              <span className="pedido-card-top-esquerda">
                {p.statusEntrega in STATUS_LOTE && (
                  <input
                    type="checkbox"
                    className="lote-checkbox"
                    checked={selecionados.has(p.id)}
                    onChange={() => alternarSelecao(p.id)}
                    aria-label={`Selecionar pedido #${p.id}`}
                  />
                )}
                <span className="pedido-numero">#{p.id}</span> <BadgeStatus status={p.statusEntrega} statusPlanilha={p.statusPlanilha} finalizadoSemCanhoto={p.finalizadoSemCanhoto} />
                {p.mostraIconeDinheiro && <IconeDinheiro />}
                {p.statusFinanceiro === "AGUARDANDO_ACERTO" && <span className="badge badge-acerto" style={{ marginLeft: 6 }}>Aguardando acerto</span>}
              </span>
              <span>{Number(p.valorPedido).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
            </div>
            <div className="pedido-cliente">{p.cliente}</div>
            <div className="pedido-endereco">{p.rua}, {p.numero} — {p.bairro}, {p.cidade}</div>
            <PedidoAcoes pedido={p} />
          </div>
        ))}
      </div>
    </div>
  );
}

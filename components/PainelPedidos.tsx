"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TabelaPedidos from "@/components/TabelaPedidos";
import FiltroMultiplo from "@/components/FiltroMultiplo";
import FiltroPeriodo from "@/components/FiltroPeriodo";
import { enviarAcao, STATUS_SEM_CANHOTO } from "@/components/PedidoAcoes";
import { LABEL_STATUS } from "@/lib/statusLabels";
import { dataNoIntervalo } from "@/lib/filtroPeriodo";

type Pedido = {
  id: string;
  cliente: string;
  transportador: string;
  statusEntrega: string;
  statusPlanilha: string | null;
  statusFinanceiro: string;
  valorPedido: number;
  canhotoUrl: string | null;
  comprovantePagamentoUrl: string | null;
  finalizadoSemCanhoto: boolean;
  mostraIconeDinheiro: boolean;
  dataPedido: Date | null;
};

const OPCOES_STATUS = Object.entries(LABEL_STATUS).map(([valor, rotulo]) => ({ valor, rotulo }));

export default function PainelPedidos({
  pedidos,
  transportadores,
  podeFinalizarLegado = false,
  statusInicial,
  children,
}: {
  pedidos: Pedido[];
  transportadores: string[];
  podeFinalizarLegado?: boolean;
  statusInicial?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<Set<string>>(
    () => new Set(statusInicial && statusInicial in LABEL_STATUS ? [statusInicial] : [])
  );
  const [transportadorFiltro, setTransportadorFiltro] = useState<Set<string>>(new Set());
  const [dataInicial, setDataInicial] = useState("");
  const [dataFinal, setDataFinal] = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [processandoLote, setProcessandoLote] = useState(false);
  const [processandoAceitar, setProcessandoAceitar] = useState(false);
  const [erroLote, setErroLote] = useState("");

  const opcoesTransportador = useMemo(
    () => transportadores.map((t) => ({ valor: t, rotulo: t })),
    [transportadores]
  );

  const buscaNormalizada = busca.trim().toLowerCase();
  const filtrados = pedidos.filter((p) => {
    if (statusFiltro.size > 0 && !statusFiltro.has(p.statusEntrega)) return false;
    if (transportadorFiltro.size > 0 && !transportadorFiltro.has(p.transportador)) return false;
    if (!dataNoIntervalo(p.dataPedido, dataInicial, dataFinal)) return false;
    if (buscaNormalizada) {
      const alvo = `${p.id} ${p.cliente}`.toLowerCase();
      if (!alvo.includes(buscaNormalizada)) return false;
    }
    return true;
  });

  const pendentes = filtrados.filter((p) => !["ENTREGUE", "CANCELADO", "DEVOLVIDO", "REENTREGA"].includes(p.statusEntrega));
  const acerto = filtrados.filter((p) => p.statusFinanceiro === "AGUARDANDO_ACERTO");

  const elegiveisAceitar = filtrados.filter((p) => p.statusEntrega === "AGUARDANDO_ACEITE");
  const elegiveisSemComprovante = podeFinalizarLegado
    ? filtrados.filter((p) => !STATUS_SEM_CANHOTO.includes(p.statusEntrega))
    : [];
  const idsElegiveisAceitar = new Set(elegiveisAceitar.map((p) => p.id));
  const idsElegiveisSemComprovante = new Set(elegiveisSemComprovante.map((p) => p.id));
  // União das duas — usada só pra decidir em quais linhas mostrar checkbox
  // e o "selecionar todos"; cada ação em massa filtra o próprio subconjunto
  // elegível na hora de agir.
  const idsElegiveisLote = new Set([...idsElegiveisAceitar, ...idsElegiveisSemComprovante]);

  const algumSelecionadoAceitar = [...selecionados].some((id) => idsElegiveisAceitar.has(id));
  const algumSelecionadoSemComprovante = podeFinalizarLegado && [...selecionados].some((id) => idsElegiveisSemComprovante.has(id));

  function alternarSelecao(id: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function alternarSelecionarTodos() {
    const ids = [...idsElegiveisLote];
    const todosJaSelecionados = ids.length > 0 && ids.every((id) => selecionados.has(id));
    setSelecionados(todosJaSelecionados ? new Set() : new Set(ids));
  }

  async function aceitarPeloTransportadorLote() {
    const ids = [...selecionados].filter((id) => idsElegiveisAceitar.has(id));
    if (ids.length === 0) return;
    if (!window.confirm(`Aceitar ${ids.length} pedido(s) em nome do transportador? Move de "Aguardando aceite" pra "Aguardando carregamento".`)) {
      return;
    }
    setProcessandoAceitar(true);
    setErroLote("");
    try {
      const resultados = await Promise.allSettled(
        ids.map((id) => enviarAcao(id, { acao: "aceitarPeloTransportador" }))
      );
      const falhas = resultados.filter((r) => r.status === "rejected").length;
      if (falhas > 0) {
        setErroLote(`${falhas} de ${ids.length} pedido(s) não puderam ser aceitos. Tente novamente.`);
      }
      setSelecionados(new Set());
      router.refresh();
    } finally {
      setProcessandoAceitar(false);
    }
  }

  async function marcarSemComprovanteLote() {
    const justificativa = window.prompt(
      'Justificativa (obrigatória, aplicada a todos os pedidos selecionados) — ex: "Pedido anterior à implantação do sistema":',
      "Pedido anterior à implantação do sistema"
    );
    if (justificativa === null) return;
    if (!justificativa.trim()) {
      setErroLote("Informe uma justificativa pra finalizar sem comprovante.");
      return;
    }
    const ids = [...selecionados].filter((id) => idsElegiveisSemComprovante.has(id));
    if (ids.length === 0) return;
    if (!window.confirm(`Marcar ${ids.length} pedido(s) como entregue SEM comprovante? Isso fica registrado permanentemente no histórico de cada um.`)) {
      return;
    }
    setProcessandoLote(true);
    setErroLote("");
    try {
      const resultados = await Promise.allSettled(
        ids.map((id) => enviarAcao(id, { acao: "finalizarSemComprovante", justificativa: justificativa.trim() }))
      );
      const falhas = resultados.filter((r) => r.status === "rejected").length;
      if (falhas > 0) {
        setErroLote(`${falhas} de ${ids.length} pedido(s) não puderam ser atualizados. Tente novamente.`);
      }
      setSelecionados(new Set());
      router.refresh();
    } finally {
      setProcessandoLote(false);
    }
  }

  return (
    <div>
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-value">{filtrados.length}</div>
          <div className="kpi-label">Total de pedidos</div>
        </div>
        <div className="kpi-card amber">
          <div className="kpi-value">{pendentes.length}</div>
          <div className="kpi-label">Pendentes de entrega</div>
        </div>
        <div className="kpi-card violet">
          <div className="kpi-value">{acerto.length}</div>
          <div className="kpi-label">Aguardando acerto</div>
        </div>
      </div>

      {children}

      <div className="filtros-pedidos">
        <input
          type="text"
          placeholder="Buscar por nº do pedido ou cliente..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="busca-pedidos"
        />
        <FiltroMultiplo rotulo="Status" opcoes={OPCOES_STATUS} selecionados={statusFiltro} onChange={setStatusFiltro} />
        <FiltroMultiplo rotulo="Transportadores" opcoes={opcoesTransportador} selecionados={transportadorFiltro} onChange={setTransportadorFiltro} />
        <FiltroPeriodo dataInicial={dataInicial} dataFinal={dataFinal} onChangeInicial={setDataInicial} onChangeFinal={setDataFinal} />
      </div>

      {idsElegiveisLote.size > 0 && (
        <div className="lote-topo">
          <label className="lote-selecionar-todos">
            <input
              type="checkbox"
              checked={[...idsElegiveisLote].every((id) => selecionados.has(id))}
              onChange={alternarSelecionarTodos}
            />
            Selecionar todos os elegíveis ({idsElegiveisLote.size})
          </label>
        </div>
      )}

      {selecionados.size > 0 && (
        <div className="lote-barra">
          <span>{selecionados.size} selecionado(s)</span>
          {algumSelecionadoAceitar && (
            <button disabled={processandoAceitar} onClick={aceitarPeloTransportadorLote}>
              {processandoAceitar ? "Processando..." : `Aceitar pelo transportador (${[...selecionados].filter((id) => idsElegiveisAceitar.has(id)).length})`}
            </button>
          )}
          {algumSelecionadoSemComprovante && (
            <button disabled={processandoLote} onClick={marcarSemComprovanteLote}>
              {processandoLote ? "Processando..." : `Marcar como entregue sem comprovante (${[...selecionados].filter((id) => idsElegiveisSemComprovante.has(id)).length})`}
            </button>
          )}
          <button className="link-botao" onClick={() => setSelecionados(new Set())}>
            Limpar seleção
          </button>
        </div>
      )}
      {erroLote && <p className="erro" style={{ marginBottom: 12 }}>{erroLote}</p>}

      <TabelaPedidos
        pedidos={filtrados}
        podeFinalizarLegado={podeFinalizarLegado}
        idsElegiveisLote={idsElegiveisLote}
        selecionados={selecionados}
        onAlternarSelecao={alternarSelecao}
      />
    </div>
  );
}

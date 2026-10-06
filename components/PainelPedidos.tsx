"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TabelaPedidos from "@/components/TabelaPedidos";
import FiltroMultiplo from "@/components/FiltroMultiplo";
import FiltroPeriodo from "@/components/FiltroPeriodo";
import { enviarAcao, STATUS_SEM_CANHOTO } from "@/components/PedidoAcoes";
import { LABEL_STATUS } from "@/lib/statusLabels";
import { dataNoIntervalo } from "@/lib/filtroPeriodo";
import { executarEmLote } from "@/lib/emLote";
import BotaoExportarExcel from "@/components/BotaoExportarExcel";
import { chaveTransportador } from "@/lib/transportador";

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
  alertaProblema: boolean;
  alertaProblemaObservacao: string | null;
  alertaRejeicaoCanhoto: boolean;
  alertaRejeicaoCanhotoObservacao: string | null;
  alertaRejeicaoComprovante: boolean;
  alertaRejeicaoComprovanteObservacao: string | null;
};

// "Entregue (sem comprovante)" não é um statusEntrega próprio no banco — é
// o mesmo ENTREGUE com finalizadoSemCanhoto=true (ver BadgeStatus). Pra
// poder filtrar separado do "Entregue" normal, usa essa chave sintética só
// no filtro, nunca gravada em lugar nenhum.
const CHAVE_ENTREGUE_SEM_COMPROVANTE = "ENTREGUE_SEM_COMPROVANTE";

// Status em que o pedido já saiu do fluxo de entrega — o que NÃO está aqui
// ainda é uma entrega em aberto pro sistema.
const STATUS_FINALIZADOS = ["ENTREGUE", "CANCELADO", "DEVOLVIDO", "REENTREGA"];

// Outra chave sintética: agrupa tudo que ainda está pendente de entrega no
// sistema, INDEPENDENTE do que a planilha diz. É o caso dos pedidos que vêm
// como "Entregue" na planilha mas seguem sem canhoto aqui (o status
// AGUARDANDO_CANHOTO, e também os que a planilha baixou antes do
// transportador sequer aceitar/sair pra rota) — justamente os que somem de
// vista quando a pessoa confia só na coluna da planilha.
const CHAVE_PENDENTES = "PENDENTES_DE_ENTREGA";

// Devolve TODAS as chaves de filtro que o pedido atende (um pedido pendente
// responde pelo próprio status e também por "Entregas pendentes"). "Entregue"
// e "Entregue (sem comprovante)" seguem mutuamente exclusivos, como antes.
function chavesStatusFiltro(p: { statusEntrega: string; finalizadoSemCanhoto: boolean }) {
  const chaves =
    p.statusEntrega === "ENTREGUE" && p.finalizadoSemCanhoto
      ? [CHAVE_ENTREGUE_SEM_COMPROVANTE]
      : [p.statusEntrega];
  if (!STATUS_FINALIZADOS.includes(p.statusEntrega)) chaves.push(CHAVE_PENDENTES);
  return chaves;
}

// Quantas linhas a tabela desenha por vez. Os filtros, a busca e os totais
// continuam valendo sobre TODOS os pedidos — isso aqui só evita o navegador
// ter que montar 10 mil linhas de uma vez, que era o que travava a abertura
// da tela. O botão "Carregar mais" revela o próximo lote.
const LOTE_LINHAS = 200;

const OPCOES_STATUS = (() => {
  const opcoes = Object.entries(LABEL_STATUS).map(([valor, rotulo]) => ({ valor, rotulo }));
  const indiceEntregue = opcoes.findIndex((o) => o.valor === "ENTREGUE");
  opcoes.splice(indiceEntregue + 1, 0, { valor: CHAVE_ENTREGUE_SEM_COMPROVANTE, rotulo: "Entregue (sem comprovante)" });
  // Primeiro da lista: é o atalho mais usado pra achar o que ficou pra trás.
  opcoes.unshift({ valor: CHAVE_PENDENTES, rotulo: "Entregas pendentes (inclui baixadas na planilha)" });
  return opcoes;
})();

export default function PainelPedidos({
  pedidos,
  transportadores,
  podeFinalizarLegado = false,
  statusInicial,
  apenasAlertaProblema = false,
  children,
}: {
  pedidos: Pedido[];
  transportadores: string[];
  podeFinalizarLegado?: boolean;
  statusInicial?: string;
  apenasAlertaProblema?: boolean;
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
  const [limite, setLimite] = useState(LOTE_LINHAS);
  const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null);

  const opcoesTransportador = useMemo(
    () => transportadores.map((t) => ({ valor: t, rotulo: t.toUpperCase() })),
    [transportadores]
  );

  // Compara transportador pela mesma chave que o resto do sistema usa: um
  // nome escrito com outra caixa na planilha continua caindo no filtro certo.
  const chavesTransportadorFiltro = useMemo(
    () => new Set([...transportadorFiltro].map(chaveTransportador)),
    [transportadorFiltro]
  );

  const buscaNormalizada = busca.trim().toLowerCase();
  const filtrados = pedidos.filter((p) => {
    if (apenasAlertaProblema && !p.alertaProblema) return false;
    if (statusFiltro.size > 0 && !chavesStatusFiltro(p).some((c) => statusFiltro.has(c))) return false;
    if (transportadorFiltro.size > 0 && !chavesTransportadorFiltro.has(chaveTransportador(p.transportador))) return false;
    if (!dataNoIntervalo(p.dataPedido, dataInicial, dataFinal)) return false;
    if (buscaNormalizada) {
      const alvo = `${p.id} ${p.cliente}`.toLowerCase();
      if (!alvo.includes(buscaNormalizada)) return false;
    }
    return true;
  });

  // Sempre que a pessoa mexe em qualquer filtro, a contagem volta pro primeiro
  // lote — senão ela filtraria e continuaria vendo a quantidade de linhas que
  // tinha revelado na busca anterior. Ajuste direto no render (sem efeito),
  // que é o jeito recomendado de reagir a mudança de prop/estado.
  const assinaturaFiltros = [
    buscaNormalizada,
    [...statusFiltro].sort().join(","),
    [...transportadorFiltro].sort().join(","),
    dataInicial,
    dataFinal,
    String(apenasAlertaProblema),
  ].join("|");
  const [assinaturaAnterior, setAssinaturaAnterior] = useState(assinaturaFiltros);
  if (assinaturaFiltros !== assinaturaAnterior) {
    setAssinaturaAnterior(assinaturaFiltros);
    setLimite(LOTE_LINHAS);
  }

  const visiveis = filtrados.slice(0, limite);
  const restantes = filtrados.length - visiveis.length;

  const pendentes = filtrados.filter((p) => !["ENTREGUE", "CANCELADO", "DEVOLVIDO", "REENTREGA"].includes(p.statusEntrega));
  const acerto = filtrados.filter((p) => p.statusFinanceiro === "AGUARDANDO_ACERTO");

  const elegiveisAceitar = filtrados.filter((p) => p.statusEntrega === "AGUARDANDO_ACEITE");
  const elegiveisSemComprovante = podeFinalizarLegado
    ? filtrados.filter((p) => !STATUS_SEM_CANHOTO.includes(p.statusEntrega))
    : [];
  const idsElegiveisAceitar = new Set(elegiveisAceitar.map((p) => p.id));
  const idsElegiveisSemComprovante = new Set(elegiveisSemComprovante.map((p) => p.id));
  // TODA linha filtrada pode ser marcada — antes a caixinha só aparecia nas
  // que servissem pra alguma ação em lote, então quem não tinha permissão de
  // dar baixa (analista comum) só conseguia marcar os "Aguardando aceite", e
  // pedido já entregue nunca podia ser marcado nem pra exportar.
  //
  // Quem decide o que cada ação faz continua sendo o subconjunto elegível de
  // cada uma (idsElegiveisAceitar / idsElegiveisSemComprovante), calculados
  // acima e aplicados na hora de agir: marcar um pedido que não serve pra
  // uma ação simplesmente não o inclui nela.
  const idsElegiveisLote = new Set(filtrados.map((p) => p.id));

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
    setProgresso({ feitos: 0, total: ids.length });
    try {
      const { falhas } = await executarEmLote(
        ids,
        (id) => enviarAcao(id, { acao: "aceitarPeloTransportador" }),
        { onProgresso: (feitos, total) => setProgresso({ feitos, total }) }
      );
      if (falhas.length > 0) {
        setErroLote(
          `${falhas.length} de ${ids.length} pedido(s) não puderam ser aceitos (nº ${falhas.slice(0, 10).join(", ")}${falhas.length > 10 ? "..." : ""}). Os outros foram aceitos.`
        );
      }
      setSelecionados(new Set());
      router.refresh();
    } finally {
      setProcessandoAceitar(false);
      setProgresso(null);
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
    setProgresso({ feitos: 0, total: ids.length });
    try {
      const { falhas } = await executarEmLote(
        ids,
        (id) => enviarAcao(id, { acao: "finalizarSemComprovante", justificativa: justificativa.trim() }),
        { onProgresso: (feitos, total) => setProgresso({ feitos, total }) }
      );
      if (falhas.length > 0) {
        setErroLote(
          `${falhas.length} de ${ids.length} pedido(s) não puderam ser atualizados (nº ${falhas.slice(0, 10).join(", ")}${falhas.length > 10 ? "..." : ""}). Os outros foram baixados.`
        );
      }
      setSelecionados(new Set());
      router.refresh();
    } finally {
      setProcessandoLote(false);
      setProgresso(null);
    }
  }

  return (
    <div>
      {apenasAlertaProblema && (
        <div className="somente-leitura-aviso">
          Mostrando só pedidos com problema sinalizado pelo transportador.
          <Link href="/dashboard/admin" className="link-botao" style={{ marginLeft: 6 }}>Limpar filtro</Link>
        </div>
      )}
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
            Selecionar todos os {idsElegiveisLote.size} pedidos filtrados
          </label>
          <BotaoExportarExcel
            tipo="pedidos"
            ids={filtrados.map((p) => p.id)}
            rotulo={`Exportar Excel (${filtrados.length})`}
            titulo="Baixa uma planilha formatada com exatamente os pedidos que estão filtrados na tela"
          />
        </div>
      )}

      {selecionados.size > 0 && (
        <div className="lote-barra">
          <span>{selecionados.size} selecionado(s)</span>
          {progresso && (
            <span className="muted">
              processando {progresso.feitos} de {progresso.total}...
            </span>
          )}
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
          <BotaoExportarExcel
            tipo="pedidos"
            ids={[...selecionados]}
            rotulo={`Exportar selecionados (${selecionados.size})`}
            titulo="Planilha formatada só com os pedidos marcados"
          />
          {!algumSelecionadoAceitar && !algumSelecionadoSemComprovante && !progresso && (
            <span className="muted">
              Nenhuma outra ação em lote se aplica ao que está marcado (pedidos já entregues ou
              cancelados, por exemplo).
            </span>
          )}
          <button className="link-botao" onClick={() => setSelecionados(new Set())}>
            Limpar seleção
          </button>
        </div>
      )}
      {erroLote && <p className="erro" style={{ marginBottom: 12 }}>{erroLote}</p>}

      <TabelaPedidos
        pedidos={visiveis}
        podeFinalizarLegado={podeFinalizarLegado}
        idsElegiveisLote={idsElegiveisLote}
        selecionados={selecionados}
        onAlternarSelecao={alternarSelecao}
      />

      {restantes > 0 && (
        <div className="carregar-mais">
          <span className="muted">
            Mostrando {visiveis.length} de {filtrados.length} pedidos
          </span>
          <button className="btn-ghost" onClick={() => setLimite((atual) => atual + LOTE_LINHAS)}>
            Carregar mais {Math.min(restantes, LOTE_LINHAS)}
          </button>
          {restantes > LOTE_LINHAS && (
            <button className="link-botao" onClick={() => setLimite(filtrados.length)}>
              Mostrar todos ({filtrados.length})
            </button>
          )}
        </div>
      )}
    </div>
  );
}

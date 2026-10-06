"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PedidoAcoes, { BadgeStatus, LABEL_STATUS, enviarAcao } from "@/components/PedidoAcoes";
import IconeDinheiro from "@/components/IconeDinheiro";
import FiltroPeriodo from "@/components/FiltroPeriodo";
import { dataNoIntervalo } from "@/lib/filtroPeriodo";
import { formatarDataPura } from "@/lib/formatarData";
import { executarEmLote } from "@/lib/emLote";
import BotaoExportarExcel from "@/components/BotaoExportarExcel";

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
  dataPedido: Date | null;
  alertaProblema: boolean;
  alertaProblemaObservacao: string | null;
  alertaRejeicaoCanhoto: boolean;
  alertaRejeicaoCanhotoObservacao: string | null;
  alertaRejeicaoComprovante: boolean;
  alertaRejeicaoComprovanteObservacao: string | null;
};

// Únicos status em que uma ação em lote se aplica — nunca leva um pedido
// direto pra "Entregue" (isso sempre exige anexar canhoto individualmente).
const STATUS_LOTE: Record<string, { proximo: string; rotuloUm: string; rotuloVarios: string }> = {
  AGUARDANDO_ACEITE: { proximo: "AGUARDANDO_CARREGAMENTO", rotuloUm: "Aceitar pedido", rotuloVarios: "Aceitar" },
  AGUARDANDO_CARREGAMENTO: { proximo: "EM_ROTA", rotuloUm: "Iniciar rota", rotuloVarios: "Iniciar rota nos" },
};

// Mesma ideia da tela do admin: desenha os cartões aos poucos pra não travar
// o celular do motorista quando ele tem centenas de pedidos. Busca, filtros e
// as ações em lote continuam considerando a lista inteira.
const LOTE_CARTOES = 50;

export default function ListaPedidosOperador({ pedidos }: { pedidos: Pedido[] }) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("");
  const [dataInicial, setDataInicial] = useState("");
  const [dataFinal, setDataFinal] = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [processando, setProcessando] = useState(false);
  const [erroLote, setErroLote] = useState("");
  const [limite, setLimite] = useState(LOTE_CARTOES);
  const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null);

  const buscaNormalizada = busca.trim().toLowerCase();
  const filtrados = pedidos.filter((p) => {
    if (statusFiltro && p.statusEntrega !== statusFiltro) return false;
    if (!dataNoIntervalo(p.dataPedido, dataInicial, dataFinal)) return false;
    if (buscaNormalizada) {
      const alvo = `${p.id} ${p.cliente}`.toLowerCase();
      if (!alvo.includes(buscaNormalizada)) return false;
    }
    return true;
  });

  // Volta pro primeiro lote sempre que algum filtro muda.
  const assinaturaFiltros = [buscaNormalizada, statusFiltro, dataInicial, dataFinal].join("|");
  const [assinaturaAnterior, setAssinaturaAnterior] = useState(assinaturaFiltros);
  if (assinaturaFiltros !== assinaturaAnterior) {
    setAssinaturaAnterior(assinaturaFiltros);
    setLimite(LOTE_CARTOES);
  }

  const visiveis = filtrados.slice(0, limite);
  const restantes = filtrados.length - visiveis.length;

  const aguardandoAceite = filtrados.filter((p) => p.statusEntrega === "AGUARDANDO_ACEITE");
  const aguardandoCarregamento = filtrados.filter((p) => p.statusEntrega === "AGUARDANDO_CARREGAMENTO");
  // Qualquer pedido da lista pode ser marcado. A ação em lote continua só
  // valendo pra quem tem próximo passo em comum (aceitar / iniciar rota) —
  // antes a caixinha nem aparecia nos outros, o que dava a impressão de que
  // a seleção estava quebrada.
  const elegiveisLote = filtrados;

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
    setProgresso({ feitos: 0, total: ids.length });
    try {
      const { falhas } = await executarEmLote(
        ids,
        (id) => enviarAcao(id, { acao: "avancarStatus", statusEntrega: alvo.proximo }),
        { onProgresso: (feitos, total) => setProgresso({ feitos, total }) }
      );
      if (falhas.length > 0) {
        setErroLote(`${falhas.length} de ${ids.length} pedido(s) não puderam ser atualizados. Os outros foram.`);
      }
      setSelecionados(new Set());
      router.refresh();
    } finally {
      setProcessando(false);
      setProgresso(null);
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
        <FiltroPeriodo dataInicial={dataInicial} dataFinal={dataFinal} onChangeInicial={setDataInicial} onChangeFinal={setDataFinal} />
      </div>

      {elegiveisLote.length > 0 && (
        <div className="lote-topo">
          <label className="lote-selecionar-todos">
            <input
              type="checkbox"
              checked={elegiveisLote.every((p) => selecionados.has(p.id))}
              onChange={alternarSelecionarTodos}
            />
            Selecionar todos os {elegiveisLote.length} pedidos filtrados
          </label>
          <BotaoExportarExcel
            tipo="pedidos"
            ids={filtrados.map((p) => p.id)}
            rotulo={`Exportar Excel (${filtrados.length})`}
            titulo="Planilha formatada com os seus pedidos que estão filtrados na tela"
          />
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
          {progresso && (
            <span className="muted">
              processando {progresso.feitos} de {progresso.total}...
            </span>
          )}
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
            !progresso && (
              <span className="muted">
                Pra agir em lote, marque pedidos que estejam todos no mesmo status (aguardando
                aceite ou aguardando carregamento).
              </span>
            )
          )}
          <button className="link-botao" onClick={() => setSelecionados(new Set())}>
            Limpar seleção
          </button>
        </div>
      )}
      {erroLote && <p className="erro" style={{ marginBottom: 12 }}>{erroLote}</p>}

      <div className="pedido-list">
        {filtrados.length === 0 && <p className="muted">Nenhum pedido encontrado.</p>}
        {visiveis.map((p) => (
          <div key={p.id} className="pedido-card">
            <div className="pedido-card-top">
              <span className="pedido-card-top-esquerda">
                <input
                  type="checkbox"
                  className="lote-checkbox"
                  checked={selecionados.has(p.id)}
                  onChange={() => alternarSelecao(p.id)}
                  aria-label={`Selecionar pedido #${p.id}`}
                />
                <span className="pedido-numero">#{p.id}</span> <BadgeStatus status={p.statusEntrega} statusPlanilha={p.statusPlanilha} finalizadoSemCanhoto={p.finalizadoSemCanhoto} />
                {p.mostraIconeDinheiro && <IconeDinheiro />}
                {p.statusFinanceiro === "AGUARDANDO_ACERTO" && <span className="badge badge-acerto" style={{ marginLeft: 6 }}>Aguardando acerto</span>}
              </span>
              <span>{Number(p.valorPedido).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
            </div>
            <div className="pedido-cliente">{p.cliente}</div>
            <div className="pedido-endereco">{p.rua}, {p.numero} — {p.bairro}, {p.cidade}</div>
            <div className="muted" style={{ marginBottom: 10 }}>Data do pedido: {formatarDataPura(p.dataPedido)}</div>
            <PedidoAcoes pedido={p} />
          </div>
        ))}
      </div>

      {restantes > 0 && (
        <div className="carregar-mais">
          <span className="muted">
            Mostrando {visiveis.length} de {filtrados.length} pedidos
          </span>
          <button className="btn-ghost" onClick={() => setLimite((atual) => atual + LOTE_CARTOES)}>
            Carregar mais {Math.min(restantes, LOTE_CARTOES)}
          </button>
        </div>
      )}
    </div>
  );
}

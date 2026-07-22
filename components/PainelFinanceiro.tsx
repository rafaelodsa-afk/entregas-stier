"use client";

import { useMemo, useState } from "react";
import FinanceiroPrevisto from "@/components/FinanceiroPrevisto";
import FinanceiroTabela from "@/components/FinanceiroTabela";
import FinanceiroHistorico from "@/components/FinanceiroHistorico";
import FiltroMultiplo from "@/components/FiltroMultiplo";
import FiltroPeriodo from "@/components/FiltroPeriodo";
import { dataNoIntervalo } from "@/lib/filtroPeriodo";

type PedidoPrevisto = {
  id: string;
  cliente: string;
  transportador: string;
  formaPagamento: string;
  statusEntrega: string;
  valorPedido: number;
  dataPedido: Date | null;
};

type PedidoAberto = {
  id: string;
  cliente: string;
  transportador: string;
  formaPagamento: string;
  valorPedido: number;
  dataPedido: Date | null;
  dataEntrega: Date | null;
  comprovantePagamentoUrl: string | null;
};

type PedidoPago = {
  id: string;
  cliente: string;
  transportador: string;
  valorPedido: number;
  dataPedido: Date | null;
  acertoConfirmadoEm: Date | null;
  comprovantePagamentoUrl: string | null;
};

const OPCOES_STATUS_FINANCEIRO = [
  { valor: "PREVISTO", rotulo: "Previsto" },
  { valor: "AGUARDANDO_ACERTO", rotulo: "Aguardando acerto" },
  { valor: "PAGO", rotulo: "Pago" },
];

export default function PainelFinanceiro({
  previstos,
  aguardandoAcerto,
  historico,
  transportadores,
}: {
  previstos: PedidoPrevisto[];
  aguardandoAcerto: PedidoAberto[];
  historico: PedidoPago[];
  transportadores: string[];
}) {
  const [transportadorFiltro, setTransportadorFiltro] = useState<Set<string>>(new Set());
  const [statusFiltro, setStatusFiltro] = useState<Set<string>>(new Set());
  const [dataInicial, setDataInicial] = useState("");
  const [dataFinal, setDataFinal] = useState("");

  const opcoesTransportador = useMemo(
    () => transportadores.map((t) => ({ valor: t, rotulo: t })),
    [transportadores]
  );

  function passa(transportador: string, dataPedido: Date | null) {
    if (transportadorFiltro.size > 0 && !transportadorFiltro.has(transportador)) return false;
    if (!dataNoIntervalo(dataPedido, dataInicial, dataFinal)) return false;
    return true;
  }

  const mostraPrevisto = statusFiltro.size === 0 || statusFiltro.has("PREVISTO");
  const mostraAcerto = statusFiltro.size === 0 || statusFiltro.has("AGUARDANDO_ACERTO");
  const mostraPago = statusFiltro.size === 0 || statusFiltro.has("PAGO");

  const previstosFiltrados = previstos.filter((p) => passa(p.transportador, p.dataPedido));
  const aguardandoAcertoFiltrados = aguardandoAcerto.filter((p) => passa(p.transportador, p.dataPedido));
  const historicoFiltrados = historico.filter((p) => passa(p.transportador, p.dataPedido));

  // Força o FinanceiroTabela a remontar (e re-sincronizar seu estado
  // interno de lista) sempre que o conjunto filtrado mudar — ele guarda a
  // lista em useState próprio pra poder tirar itens da tela ao confirmar
  // um acerto sem esperar o servidor.
  const chaveAcerto = aguardandoAcertoFiltrados.map((p) => p.id).join(",");

  return (
    <div>
      <div className="filtros-pedidos">
        <FiltroMultiplo rotulo="Status financeiro" opcoes={OPCOES_STATUS_FINANCEIRO} selecionados={statusFiltro} onChange={setStatusFiltro} />
        <FiltroMultiplo rotulo="Transportadores" opcoes={opcoesTransportador} selecionados={transportadorFiltro} onChange={setTransportadorFiltro} />
        <FiltroPeriodo dataInicial={dataInicial} dataFinal={dataFinal} onChangeInicial={setDataInicial} onChangeFinal={setDataFinal} />
      </div>

      {mostraPrevisto && (
        <>
          <h2 style={{ marginBottom: 12 }}>Previsto — ainda não entregue</h2>
          <FinanceiroPrevisto pedidos={previstosFiltrados} />
        </>
      )}

      {mostraAcerto && (
        <>
          <h2 style={{ marginTop: 28, marginBottom: 12 }}>Aguardando acerto</h2>
          <FinanceiroTabela key={chaveAcerto} pedidos={aguardandoAcertoFiltrados} />
        </>
      )}

      {mostraPago && (
        <>
          <h2 style={{ marginTop: 28, marginBottom: 12 }}>Histórico de acertos recebidos</h2>
          <FinanceiroHistorico pedidos={historicoFiltrados} />
        </>
      )}
    </div>
  );
}

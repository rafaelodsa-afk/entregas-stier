"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { comprimirImagem } from "@/lib/comprimirImagem";
import { enviarArquivoParaR2 } from "@/lib/uploadR2Client";
import { formatarDataPura } from "@/lib/formatarData";
import AcertoSplit from "@/components/AcertoSplit";
import { executarEmLote } from "@/lib/emLote";

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

const LABEL_PAGAMENTO: Record<string, string> = {
  DINHEIRO: "Dinheiro",
  PIX: "PIX",
  BOLETO: "Boleto",
};

function formatarData(data: Date | null) {
  if (!data) return "—";
  return new Date(data).toLocaleDateString("pt-BR");
}

function formatarValor(valor: number) {
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function FinanceiroTabela({ pedidos }: { pedidos: PedidoAberto[] }) {
  const [lista, setLista] = useState(pedidos);
  const [idEmAcao, setIdEmAcao] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [arquivos, setArquivos] = useState<Record<string, File | null>>({});
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [processandoLote, setProcessandoLote] = useState(false);
  const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null);
  const router = useRouter();

  function alternarSelecao(id: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function alternarSelecionarTodos() {
    const todosJaSelecionados = lista.length > 0 && lista.every((p) => selecionados.has(p.id));
    setSelecionados(todosJaSelecionados ? new Set() : new Set(lista.map((p) => p.id)));
  }

  // Confirmar acerto de vários de uma vez — antes só dava um por um, o que
  // era inviável quando chegava o acerto de um transportador inteiro.
  async function confirmarAcertoLote() {
    const ids = [...selecionados].filter((id) => lista.some((p) => p.id === id));
    if (ids.length === 0) return;
    const total = ids.reduce(
      (soma, id) => soma + Number(lista.find((p) => p.id === id)?.valorPedido ?? 0),
      0
    );
    if (
      !window.confirm(
        `Confirmar o recebimento de ${ids.length} pedido(s), somando ${formatarValor(total)}? Eles saem de "Aguardando acerto" e vão pro histórico como pagos.`
      )
    ) {
      return;
    }
    setProcessandoLote(true);
    setErro("");
    setProgresso({ feitos: 0, total: ids.length });
    try {
      const { falhas } = await executarEmLote(
        ids,
        async (id) => {
          const res = await fetch(`/api/pedidos/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ acao: "confirmarAcerto" }),
          });
          if (!res.ok) throw new Error(id);
        },
        { onProgresso: (feitos, t) => setProgresso({ feitos, total: t }) }
      );
      const idsComFalha = new Set(falhas);
      if (falhas.length > 0) {
        setErro(
          `${falhas.length} de ${ids.length} pedido(s) não puderam ser confirmados (nº ${falhas.slice(0, 10).join(", ")}${falhas.length > 10 ? "..." : ""}). Os outros foram.`
        );
      }
      // Tira da tela só os que realmente deram certo.
      setLista((atual) => atual.filter((p) => !selecionados.has(p.id) || idsComFalha.has(p.id)));
      setSelecionados(new Set());
      router.refresh();
    } finally {
      setProcessandoLote(false);
      setProgresso(null);
    }
  }

  async function anexarComprovante(id: string) {
    const arquivo = arquivos[id];
    if (!arquivo) return;
    setErro("");
    setIdEmAcao(id);
    try {
      const arquivoComprimido = await comprimirImagem(arquivo);
      const { key, tipo } = await enviarArquivoParaR2(arquivoComprimido, "comprovantes-pagamento", id);
      const res = await fetch(`/api/pedidos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "anexarComprovantePagamento",
          comprovanteUrl: key,
          comprovanteTipo: tipo,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErro(data.erro || "Não foi possível anexar o comprovante.");
        return;
      }
      // Não atualiza a URL localmente aqui de propósito: a chave do R2 não é
      // uma URL utilizável direto — precisa vir do servidor já assinada, o
      // que o router.refresh() abaixo resolve.
      setArquivos((atual) => ({ ...atual, [id]: null }));
      router.refresh();
    } catch (err) {
      console.error(err);
      setErro("Erro de conexão.");
    } finally {
      setIdEmAcao(null);
    }
  }

  async function marcarComoRecebido(id: string) {
    setErro("");
    setIdEmAcao(id);
    try {
      const res = await fetch(`/api/pedidos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "confirmarAcerto" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErro(data.erro || "Não foi possível confirmar o acerto.");
        return;
      }
      setLista((atual) => atual.filter((p) => p.id !== id));
      router.refresh();
    } catch (err) {
      console.error(err);
      setErro("Erro de conexão.");
    } finally {
      setIdEmAcao(null);
    }
  }

  const total = lista.reduce((soma, p) => soma + Number(p.valorPedido), 0);

  return (
    <div>
      <div className="kpi-grid" style={{ gridTemplateColumns: "1fr" }}>
        <div className="kpi-card violet">
          <div className="kpi-value">{formatarValor(total)}</div>
          <div className="kpi-label">Total aguardando acerto ({lista.length} pedido(s))</div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <AcertoSplit pedidos={lista} />
      </div>

      {lista.length > 0 && (
        <div className="lote-topo">
          <label className="lote-selecionar-todos">
            <input
              type="checkbox"
              checked={lista.every((p) => selecionados.has(p.id))}
              onChange={alternarSelecionarTodos}
            />
            Selecionar todos os {lista.length} pedidos
          </label>
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
          <button disabled={processandoLote} onClick={confirmarAcertoLote}>
            {processandoLote ? "Processando..." : `Marcar ${selecionados.size} como recebido(s)`}
          </button>
          <button className="link-botao" onClick={() => setSelecionados(new Set())}>
            Limpar seleção
          </button>
        </div>
      )}

      {erro && <p className="erro" style={{ marginTop: 10 }}>{erro}</p>}

      {lista.length === 0 ? (
        <p className="muted" style={{ marginTop: 16 }}>Nada aguardando acerto no momento.</p>
      ) : (
        <table className="pedidos-table" style={{ marginTop: 16 }}>
          <thead>
            <tr>
              <th></th>
              <th>Nº</th>
              <th>Cliente</th>
              <th>Transportador</th>
              <th>Pagamento</th>
              <th>Data do pedido</th>
              <th>Entregue em</th>
              <th>Valor</th>
              <th>Comprovante</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.id}>
                <td>
                  <input
                    type="checkbox"
                    className="lote-checkbox"
                    checked={selecionados.has(p.id)}
                    onChange={() => alternarSelecao(p.id)}
                    aria-label={`Selecionar pedido #${p.id}`}
                  />
                </td>
                <td>#{p.id}</td>
                <td>{p.cliente}</td>
                <td>{p.transportador}</td>
                <td>{LABEL_PAGAMENTO[p.formaPagamento] ?? p.formaPagamento}</td>
                <td>{formatarDataPura(p.dataPedido)}</td>
                <td>{formatarData(p.dataEntrega)}</td>
                <td>{formatarValor(p.valorPedido)}</td>
                <td>
                  {p.comprovantePagamentoUrl ? (
                    <a className="link-canhoto" href={p.comprovantePagamentoUrl} target="_blank" rel="noreferrer">
                      Ver comprovante
                    </a>
                  ) : (
                    <div className="canhoto-upload">
                      <label className="canhoto-input-label">
                        {arquivos[p.id] ? arquivos[p.id]!.name : "Anexar comprovante"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,application/pdf"
                          onChange={(e) => setArquivos((atual) => ({ ...atual, [p.id]: e.target.files?.[0] ?? null }))}
                          hidden
                        />
                      </label>
                      <button disabled={idEmAcao === p.id || !arquivos[p.id]} onClick={() => anexarComprovante(p.id)}>
                        {idEmAcao === p.id ? "..." : "Enviar"}
                      </button>
                    </div>
                  )}
                </td>
                <td>
                  <button disabled={idEmAcao === p.id} onClick={() => marcarComoRecebido(p.id)}>
                    {idEmAcao === p.id ? "..." : "Marcar como recebido"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

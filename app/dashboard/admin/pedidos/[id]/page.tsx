import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { verifySession, COOKIE_NAME, podeVerTudo } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { LABEL_STATUS } from "@/lib/statusLabels";
import { formatarDataPura } from "@/lib/formatarData";
import { BadgeStatus } from "@/components/PedidoAcoes";

export const dynamic = "force-dynamic";

const LABEL_OPERACAO: Record<string, string> = {
  VENDA: "Venda",
  BONIFICACAO: "Bonificação",
  TRANSFERENCIA: "Transferência",
  REMESSA: "Remessa",
};

const LABEL_PAGAMENTO: Record<string, string> = {
  DINHEIRO: "Dinheiro",
  PIX: "PIX",
  BOLETO: "Boleto",
};

const LABEL_FINANCEIRO: Record<string, string> = {
  NA: "Não se aplica",
  AGUARDANDO_ACERTO: "Aguardando acerto",
  PAGO: "Pago",
};

function formatarData(data: Date | null) {
  if (!data) return "—";
  return new Date(data).toLocaleDateString("pt-BR");
}

function formatarDataHora(data: Date) {
  return new Date(data).toLocaleString("pt-BR");
}

export default async function DetalhePedidoPage({ params }: { params: { id: string } }) {
  const token = cookies().get(COOKIE_NAME)?.value;
  const sessao = token ? await verifySession(token) : null;
  if (!sessao || !podeVerTudo(sessao.papel)) redirect("/dashboard");

  const pedido = await prisma.pedido.findUnique({
    where: { id: params.id },
    include: { historico: { orderBy: { data: "desc" } } },
  });
  if (!pedido) notFound();

  return (
    <div>
      <p style={{ marginBottom: 12 }}>
        <Link className="link-canhoto" href="/dashboard/admin">
          ← Voltar pra lista de pedidos
        </Link>
      </p>

      <h1 className="page-title">Pedido #{pedido.id}</h1>
      <p className="page-sub" style={{ marginBottom: 20 }}>
        <BadgeStatus status={pedido.statusEntrega} statusPlanilha={pedido.statusPlanilha} />
      </p>

      <div className="form-card">
        <h2>Dados do pedido</h2>
        <div className="detalhe-grid">
          <div><span className="muted">Cliente</span><div>{pedido.cliente}</div></div>
          <div><span className="muted">Transportador</span><div>{pedido.transportador}</div></div>
          <div><span className="muted">Endereço</span><div>{pedido.rua || "—"}{pedido.numero ? `, ${pedido.numero}` : ""}{pedido.bairro ? ` — ${pedido.bairro}` : ""}{pedido.cidade ? `, ${pedido.cidade}` : ""}</div></div>
          <div><span className="muted">Operação</span><div>{LABEL_OPERACAO[pedido.operacao] ?? pedido.operacao}</div></div>
          <div><span className="muted">Forma de pagamento</span><div>{LABEL_PAGAMENTO[pedido.formaPagamento] ?? pedido.formaPagamento}</div></div>
          <div><span className="muted">Valor</span><div>{Number(pedido.valorPedido).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div></div>
          <div><span className="muted">Prazo</span><div>{pedido.prazo || "—"}</div></div>
          <div><span className="muted">Data prevista de entrega</span><div>{formatarDataPura(pedido.dataPrevistaEntrega)}</div></div>
          <div><span className="muted">Status na planilha</span><div>{pedido.statusPlanilha || "—"}</div></div>
          <div><span className="muted">Status financeiro</span><div>{LABEL_FINANCEIRO[pedido.statusFinanceiro] ?? pedido.statusFinanceiro}</div></div>
          <div><span className="muted">Data de criação</span><div>{formatarDataHora(pedido.dataCriacao)}</div></div>
          <div><span className="muted">Data de entrega</span><div>{formatarData(pedido.dataEntrega)}</div></div>
          <div><span className="muted">Acerto confirmado em</span><div>{formatarData(pedido.acertoConfirmadoEm)}</div></div>
          {pedido.observacaoProblema && (
            <div><span className="muted">Observação</span><div>{pedido.observacaoProblema}</div></div>
          )}
        </div>

        <div className="acoes-linha" style={{ marginTop: 16 }}>
          {pedido.canhotoUrl && (
            <a className="link-canhoto" href={pedido.canhotoUrl} target="_blank" rel="noreferrer">
              Ver canhoto
            </a>
          )}
          {pedido.comprovantePagamentoUrl && (
            <a className="link-canhoto" href={pedido.comprovantePagamentoUrl} target="_blank" rel="noreferrer">
              Ver comprovante de pagamento
            </a>
          )}
        </div>
      </div>

      <div className="form-card" style={{ marginTop: 20 }}>
        <h2>Histórico</h2>
        {pedido.historico.length === 0 ? (
          <p className="muted">Nenhum evento registrado ainda.</p>
        ) : (
          <table className="pedidos-table">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Status</th>
                <th>Usuário</th>
              </tr>
            </thead>
            <tbody>
              {pedido.historico.map((h) => (
                <tr key={h.id}>
                  <td>{formatarDataHora(h.data)}</td>
                  <td>{LABEL_STATUS[h.status] ?? h.status}</td>
                  <td>{h.usuario}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

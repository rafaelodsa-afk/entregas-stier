import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, COOKIE_NAME, podeVerTudo, podeFinalizarSemCanhoto } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { comLinksDeArquivo } from "@/lib/r2";
import { geraPendenciaFinanceira } from "@/lib/pedidos";
import ImportarPlanilha from "@/components/ImportarPlanilha";
import CriarPedido from "@/components/CriarPedido";
import PainelPedidos from "@/components/PainelPedidos";

export const dynamic = "force-dynamic";

export default async function AdminDashboard({ searchParams }: { searchParams: { status?: string; alertaProblema?: string } }) {
  const token = cookies().get(COOKIE_NAME)?.value;
  const sessao = token ? await verifySession(token) : null;
  if (!sessao || !podeVerTudo(sessao.papel)) redirect("/login");

  const pedidos = await prisma.pedido.findMany({
    orderBy: { dataCriacao: "desc" },
    select: {
      id: true,
      cliente: true,
      transportador: true,
      statusEntrega: true,
      statusPlanilha: true,
      statusFinanceiro: true,
      valorPedido: true,
      canhotoUrl: true,
      comprovantePagamentoUrl: true,
      finalizadoSemCanhoto: true,
      operacao: true,
      formaPagamento: true,
      dataPedido: true,
      alertaProblema: true,
      alertaRejeicaoCanhoto: true,
      alertaRejeicaoComprovante: true,
    },
  });

  // Os textos de observação ficam FORA da consulta principal de propósito:
  // só algumas dezenas de pedidos têm algum, mas, incluídos ali, o nome de
  // cada um desses três campos era repetido nas dez mil linhas — mais de 1 MB
  // de peso extra pro navegador processar, quase tudo vazio. Aqui vêm só os
  // que realmente têm texto, e são encaixados de volta logo abaixo, então as
  // telas continuam recebendo exatamente o mesmo formato de antes.
  const observacoes = await prisma.pedido.findMany({
    where: {
      OR: [
        { alertaProblemaObservacao: { not: null } },
        { alertaRejeicaoCanhotoObservacao: { not: null } },
        { alertaRejeicaoComprovanteObservacao: { not: null } },
      ],
    },
    select: {
      id: true,
      alertaProblemaObservacao: true,
      alertaRejeicaoCanhotoObservacao: true,
      alertaRejeicaoComprovanteObservacao: true,
    },
  });
  const observacaoPorPedido = new Map(observacoes.map((o) => [o.id, o]));

  const transportadores = [...new Set(pedidos.map((p) => p.transportador))].sort();
  const pedidosComLinks = pedidos.map((p) => {
    const obs = observacaoPorPedido.get(p.id);
    return comLinksDeArquivo({
      ...p,
      alertaProblemaObservacao: obs?.alertaProblemaObservacao ?? null,
      alertaRejeicaoCanhotoObservacao: obs?.alertaRejeicaoCanhotoObservacao ?? null,
      alertaRejeicaoComprovanteObservacao: obs?.alertaRejeicaoComprovanteObservacao ?? null,
    });
  });

  return (
    <div>
      <PainelPedidos
        key={searchParams.status ?? "todos"}
        transportadores={transportadores}
        podeFinalizarLegado={podeFinalizarSemCanhoto(sessao.papel)}
        statusInicial={searchParams.status}
        apenasAlertaProblema={searchParams.alertaProblema === "1"}
        pedidos={pedidosComLinks.map((p) => ({
          id: p.id,
          cliente: p.cliente,
          transportador: p.transportador,
          statusEntrega: p.statusEntrega,
          statusPlanilha: p.statusPlanilha,
          statusFinanceiro: p.statusFinanceiro,
          valorPedido: Number(p.valorPedido),
          canhotoUrl: p.canhotoUrl,
          comprovantePagamentoUrl: p.comprovantePagamentoUrl,
          finalizadoSemCanhoto: p.finalizadoSemCanhoto,
          mostraIconeDinheiro: geraPendenciaFinanceira(p.operacao, p.formaPagamento),
          dataPedido: p.dataPedido,
          alertaProblema: p.alertaProblema,
          alertaProblemaObservacao: p.alertaProblemaObservacao,
          alertaRejeicaoCanhoto: p.alertaRejeicaoCanhoto,
          alertaRejeicaoCanhotoObservacao: p.alertaRejeicaoCanhotoObservacao,
          alertaRejeicaoComprovante: p.alertaRejeicaoComprovante,
          alertaRejeicaoComprovanteObservacao: p.alertaRejeicaoComprovanteObservacao,
        }))}
      >
        <ImportarPlanilha />
        <CriarPedido />
      </PainelPedidos>
    </div>
  );
}

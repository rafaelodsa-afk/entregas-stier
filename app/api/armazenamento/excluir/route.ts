import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { podeExcluirMes } from "@/lib/auth";
import { resumoDoMes } from "@/lib/resumoMes";

const REGEX_MES = /^\d{4}-\d{2}$/;

// Ação irreversível — apaga de verdade os pedidos (+ histórico, em
// cascata) e os arquivos correspondentes no Vercel Blob. Só master/admin,
// só depois de o mês já ter sido exportado pelo menos uma vez, e só se o
// mês de confirmação enviado bater exatamente com o mês pedido (a tela já
// trava isso no cliente, mas confia-se pouco: confere de novo aqui).
export async function POST(req: NextRequest) {
  const papel = (req.headers.get("x-user-papel") ?? "TRANSPORTADOR") as
    | "MASTER"
    | "ADMIN"
    | "ANALISTA"
    | "TRANSPORTADOR";
  if (!podeExcluirMes(papel)) {
    return NextResponse.json({ erro: "Sem permissão para excluir pedidos em lote" }, { status: 403 });
  }

  let body: { mes?: string; confirmacaoMes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "Requisição inválida" }, { status: 400 });
  }

  const mes = String(body.mes ?? "").trim();
  const confirmacaoMes = String(body.confirmacaoMes ?? "").trim();
  if (!REGEX_MES.test(mes)) {
    return NextResponse.json({ erro: "Informe o mês no formato AAAA-MM" }, { status: 400 });
  }
  if (confirmacaoMes !== mes) {
    return NextResponse.json({ erro: "A confirmação não bate com o mês selecionado" }, { status: 400 });
  }

  const exportacao = await prisma.exportacaoMensal.findUnique({ where: { mes } });
  if (!exportacao) {
    return NextResponse.json({ erro: "Este mês ainda não foi exportado — exporte antes de excluir" }, { status: 400 });
  }

  const resumo = await resumoDoMes(mes);
  if (resumo.totalPedidos === 0) {
    return NextResponse.json({ erro: `Nenhum pedido encontrado para ${mes}` }, { status: 404 });
  }

  if (resumo.urlsParaExcluir.length > 0) {
    try {
      await del(resumo.urlsParaExcluir);
    } catch (err) {
      console.error("Erro ao apagar arquivos do Blob:", err);
      return NextResponse.json({ erro: "Não foi possível apagar os arquivos do armazenamento. Nada foi excluído." }, { status: 500 });
    }
  }

  // HistoricoPedido é apagado em cascata (onDelete: Cascade no schema).
  await prisma.pedido.deleteMany({ where: { id: { in: resumo.idsPedidos } } });

  const nomeUsuario = decodeURIComponent(req.headers.get("x-user-nome") ?? "sistema");
  await prisma.arquivamentoLog.create({
    data: {
      mes,
      totalPedidos: resumo.totalPedidos,
      totalArquivos: resumo.totalArquivos,
      excluidoPor: nomeUsuario,
    },
  });

  return NextResponse.json({
    ok: true,
    mes,
    totalPedidos: resumo.totalPedidos,
    totalArquivos: resumo.totalArquivos,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { podeVerTudo } from "@/lib/auth";
import { resumoDoMes } from "@/lib/resumoMes";

const REGEX_MES = /^\d{4}-\d{2}$/;

// Só leitura — usado pra mostrar a simulação ("isso vai apagar X pedidos,
// Y arquivos, Z espaço") antes do admin decidir excluir de verdade.
export async function POST(req: NextRequest) {
  const papel = (req.headers.get("x-user-papel") ?? "TRANSPORTADOR") as
    | "MASTER"
    | "ADMIN"
    | "ANALISTA"
    | "TRANSPORTADOR";
  if (!podeVerTudo(papel)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  let body: { mes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "Requisição inválida" }, { status: 400 });
  }

  const mes = String(body.mes ?? "").trim();
  if (!REGEX_MES.test(mes)) {
    return NextResponse.json({ erro: "Informe o mês no formato AAAA-MM" }, { status: 400 });
  }

  const resumo = await resumoDoMes(mes);
  return NextResponse.json({
    totalPedidos: resumo.totalPedidos,
    totalCanhotos: resumo.totalCanhotos,
    totalComprovantes: resumo.totalComprovantes,
    totalArquivos: resumo.totalArquivos,
    totalBytes: resumo.totalBytes,
  });
}

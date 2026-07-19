import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { podeVerTudo } from "@/lib/auth";
import { criarOuReatribuirPedido } from "@/lib/pedidos";

function papelDaSessao(req: NextRequest) {
  return (req.headers.get("x-user-papel") ?? "TRANSPORTADOR") as
    | "MASTER"
    | "ADMIN"
    | "ANALISTA"
    | "TRANSPORTADOR";
}

export async function GET(req: NextRequest) {
  const papel = papelDaSessao(req);
  const transportador = req.headers.get("x-user-transportador") ?? "";

  const where = podeVerTudo(papel) ? {} : { transportador: transportador || "___nenhum___" };
  const pedidos = await prisma.pedido.findMany({
    where,
    orderBy: { dataCriacao: "desc" },
  });

  return NextResponse.json(pedidos);
}

export async function POST(req: NextRequest) {
  const papel = papelDaSessao(req);
  if (!podeVerTudo(papel)) {
    return NextResponse.json({ erro: "Sem permissão para criar pedidos" }, { status: 403 });
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "Requisição inválida" }, { status: 400 });
  }

  const nomeUsuario = req.headers.get("x-user-nome") ?? "sistema";
  const resultado = await criarOuReatribuirPedido(body, nomeUsuario);
  if (!resultado.ok) {
    return NextResponse.json({ erro: resultado.erro }, { status: resultado.erro.includes("já existe") ? 409 : 400 });
  }

  return NextResponse.json(resultado.pedido, { status: resultado.criado ? 201 : 200 });
}

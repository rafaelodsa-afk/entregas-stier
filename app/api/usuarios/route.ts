import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, podeGerenciarUsuariosPorPapel } from "@/lib/auth";

const PAPEIS_CRIAVEIS = ["ADMIN", "ANALISTA", "TRANSPORTADOR"];
const TIPOS_CONTA = ["TRANSPORTADOR", "MOTORISTA"];

function sessaoDoHeader(req: NextRequest) {
  const papel = (req.headers.get("x-user-papel") ?? "TRANSPORTADOR") as
    | "MASTER"
    | "ADMIN"
    | "ANALISTA"
    | "TRANSPORTADOR";
  const podeCriarUsuarios = req.headers.get("x-user-pode-criar-usuarios") === "1";
  return { papel, podeCriarUsuarios };
}

// Nunca devolve o hash da senha para o navegador.
const SELECT_SEGURO = {
  id: true,
  username: true,
  nome: true,
  papel: true,
  tipoConta: true,
  transportadorNome: true,
  podeCriarUsuarios: true,
  ativo: true,
  criadoPor: true,
  criadoEm: true,
};

export async function GET(req: NextRequest) {
  const { papel, podeCriarUsuarios } = sessaoDoHeader(req);
  if (!podeGerenciarUsuariosPorPapel(papel, podeCriarUsuarios)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const usuarios = await prisma.usuario.findMany({
    select: SELECT_SEGURO,
    orderBy: { criadoEm: "desc" },
  });
  return NextResponse.json(usuarios);
}

export async function POST(req: NextRequest) {
  const { papel, podeCriarUsuarios } = sessaoDoHeader(req);
  if (!podeGerenciarUsuariosPorPapel(papel, podeCriarUsuarios)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "Requisição inválida" }, { status: 400 });
  }

  const username = String(body.username ?? "").trim().toLowerCase();
  const senha = String(body.senha ?? "");
  const nome = String(body.nome ?? "").trim();
  const papelNovo = String(body.papel ?? "").trim().toUpperCase();

  if (!username || !senha || !nome) {
    return NextResponse.json({ erro: "Preencha usuário, senha e nome" }, { status: 400 });
  }
  if (senha.length < 6) {
    return NextResponse.json({ erro: "A senha precisa ter pelo menos 6 caracteres" }, { status: 400 });
  }
  if (!PAPEIS_CRIAVEIS.includes(papelNovo)) {
    return NextResponse.json({ erro: "Papel inválido" }, { status: 400 });
  }

  let tipoConta: string | null = null;
  let transportadorNome: string | null = null;
  if (papelNovo === "TRANSPORTADOR") {
    tipoConta = String(body.tipoConta ?? "").trim().toUpperCase();
    transportadorNome = String(body.transportadorNome ?? "").trim();
    if (!TIPOS_CONTA.includes(tipoConta)) {
      return NextResponse.json({ erro: "Selecione o tipo de conta do transportador" }, { status: 400 });
    }
    if (!transportadorNome) {
      return NextResponse.json({ erro: "Informe o nome do transportador" }, { status: 400 });
    }
  }

  // Só quem já pode gerenciar usuários pode delegar essa permissão a um admin novo.
  const podeCriarUsuariosNovo = papelNovo === "ADMIN" ? Boolean(body.podeCriarUsuarios) : false;

  const existente = await prisma.usuario.findUnique({ where: { username } });
  if (existente) {
    return NextResponse.json({ erro: "Já existe um usuário com esse nome de acesso" }, { status: 409 });
  }

  const usuario = await prisma.usuario.create({
    data: {
      username,
      senhaHash: await hashPassword(senha),
      nome,
      papel: papelNovo as any,
      tipoConta: tipoConta as any,
      transportadorNome,
      podeCriarUsuarios: podeCriarUsuariosNovo,
      criadoPor: req.headers.get("x-user-nome") ?? "sistema",
    },
    select: SELECT_SEGURO,
  });

  return NextResponse.json(usuario, { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword, signSession, COOKIE_NAME } from "@/lib/auth";

export async function POST(req: NextRequest) {
  let body: { username?: string; senha?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "Requisição inválida" }, { status: 400 });
  }

  const { username, senha } = body;
  if (!username || !senha) {
    return NextResponse.json({ erro: "Preencha usuário e senha" }, { status: 400 });
  }

  const usuario = await prisma.usuario.findUnique({
    where: { username: username.trim().toLowerCase() },
  });

  // Mensagem genérica de propósito: não revela se o problema foi o usuário
  // ou a senha, para não ajudar tentativas de adivinhação.
  if (!usuario || !usuario.ativo) {
    return NextResponse.json({ erro: "Usuário ou senha inválidos" }, { status: 401 });
  }

  const senhaOk = await verifyPassword(senha, usuario.senhaHash);
  if (!senhaOk) {
    return NextResponse.json({ erro: "Usuário ou senha inválidos" }, { status: 401 });
  }

  const token = await signSession({
    userId: usuario.id,
    username: usuario.username,
    papel: usuario.papel,
    nome: usuario.nome,
    transportadorNome: usuario.transportadorNome,
  });

  const resposta = NextResponse.json({
    ok: true,
    usuario: {
      nome: usuario.nome,
      papel: usuario.papel,
      transportadorNome: usuario.transportadorNome,
    },
  });

  resposta.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 dias
  });

  return resposta;
}

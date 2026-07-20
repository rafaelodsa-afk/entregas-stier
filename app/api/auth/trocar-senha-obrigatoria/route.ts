import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, signSession, senhaValida, MENSAGEM_REGRA_SENHA, COOKIE_NAME } from "@/lib/auth";

// Usado quando o middleware já obrigou a pessoa a trocar a senha antes de
// continuar (senha provisória recém-criada ou redefinida por um admin).
// Não pede a senha atual de novo — a sessão já provou quem é.
export async function POST(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  }

  let body: { novaSenha?: string; confirmarSenha?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "Requisição inválida" }, { status: 400 });
  }

  const novaSenha = String(body.novaSenha ?? "");
  const confirmarSenha = String(body.confirmarSenha ?? "");

  if (novaSenha !== confirmarSenha) {
    return NextResponse.json({ erro: "As senhas não coincidem" }, { status: 400 });
  }
  if (!senhaValida(novaSenha)) {
    return NextResponse.json({ erro: MENSAGEM_REGRA_SENHA }, { status: 400 });
  }

  const usuario = await prisma.usuario.update({
    where: { id: userId },
    data: { senhaHash: await hashPassword(novaSenha), precisaTrocarSenha: false },
  });

  // Reassina a sessão já com a flag desligada, senão o cookie antigo
  // continuaria mandando a pessoa de volta pra cá a cada requisição.
  const token = await signSession({
    userId: usuario.id,
    username: usuario.username,
    papel: usuario.papel,
    nome: usuario.nome,
    transportadorNome: usuario.transportadorNome,
    podeCriarUsuarios: usuario.podeCriarUsuarios,
    precisaTrocarSenha: false,
  });

  const resposta = NextResponse.json({ ok: true });
  resposta.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return resposta;
}

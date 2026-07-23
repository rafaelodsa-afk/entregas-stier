import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  verifyPassword,
  hashPassword,
  senhaValida,
  MENSAGEM_REGRA_SENHA,
  contaBloqueada,
  proximoEstadoAposErro,
  MENSAGEM_CONTA_BLOQUEADA,
} from "@/lib/auth";

// Troca de senha voluntária, direto na tela de login, sem precisar estar
// logado. Como não existe recuperação por e-mail, a senha atual é a prova
// de que é o dono do acesso.
export async function POST(req: NextRequest) {
  let body: { username?: string; senhaAtual?: string; novaSenha?: string; confirmarSenha?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "Requisição inválida" }, { status: 400 });
  }

  const username = String(body.username ?? "").trim().toLowerCase();
  const senhaAtual = String(body.senhaAtual ?? "");
  const novaSenha = String(body.novaSenha ?? "");
  const confirmarSenha = String(body.confirmarSenha ?? "");

  if (!username || !senhaAtual || !novaSenha) {
    return NextResponse.json({ erro: "Preencha todos os campos" }, { status: 400 });
  }
  if (novaSenha !== confirmarSenha) {
    return NextResponse.json({ erro: "A nova senha e a confirmação não coincidem" }, { status: 400 });
  }
  if (!senhaValida(novaSenha)) {
    return NextResponse.json({ erro: MENSAGEM_REGRA_SENHA }, { status: 400 });
  }

  const usuario = await prisma.usuario.findUnique({ where: { username } });

  // Mensagem genérica de propósito, mesma lógica do login: não revela se
  // o problema foi o usuário ou a senha atual.
  if (!usuario || !usuario.ativo) {
    return NextResponse.json({ erro: "Usuário ou senha atual inválidos" }, { status: 401 });
  }
  if (contaBloqueada(usuario)) {
    return NextResponse.json({ erro: MENSAGEM_CONTA_BLOQUEADA }, { status: 429 });
  }
  const senhaOk = await verifyPassword(senhaAtual, usuario.senhaHash);
  if (!senhaOk) {
    await prisma.usuario.update({ where: { id: usuario.id }, data: proximoEstadoAposErro(usuario) });
    return NextResponse.json({ erro: "Usuário ou senha atual inválidos" }, { status: 401 });
  }

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { senhaHash: await hashPassword(novaSenha), precisaTrocarSenha: false, tentativasFalhas: 0, bloqueadoAte: null },
  });

  return NextResponse.json({ ok: true });
}

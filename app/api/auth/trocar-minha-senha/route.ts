import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword, hashPassword, senhaValida, MENSAGEM_REGRA_SENHA } from "@/lib/auth";

// Troca de senha voluntária de dentro do dashboard, pra qualquer papel
// logado (inclusive master, que não tem "Redefinir senha" na lista de
// usuários). Exige a senha atual como prova, igual à troca pública da
// tela de login — só que aqui já sabemos quem é pela sessão.
export async function POST(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  }

  let body: { senhaAtual?: string; novaSenha?: string; confirmarSenha?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "Requisição inválida" }, { status: 400 });
  }

  const senhaAtual = String(body.senhaAtual ?? "");
  const novaSenha = String(body.novaSenha ?? "");
  const confirmarSenha = String(body.confirmarSenha ?? "");

  if (!senhaAtual || !novaSenha) {
    return NextResponse.json({ erro: "Preencha todos os campos" }, { status: 400 });
  }
  if (novaSenha !== confirmarSenha) {
    return NextResponse.json({ erro: "A nova senha e a confirmação não coincidem" }, { status: 400 });
  }
  if (!senhaValida(novaSenha)) {
    return NextResponse.json({ erro: MENSAGEM_REGRA_SENHA }, { status: 400 });
  }

  const usuario = await prisma.usuario.findUnique({ where: { id: userId } });
  if (!usuario || !usuario.ativo) {
    return NextResponse.json({ erro: "Usuário não encontrado" }, { status: 404 });
  }
  const senhaOk = await verifyPassword(senhaAtual, usuario.senhaHash);
  if (!senhaOk) {
    return NextResponse.json({ erro: "Senha atual incorreta" }, { status: 401 });
  }

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { senhaHash: await hashPassword(novaSenha) },
  });

  return NextResponse.json({ ok: true });
}

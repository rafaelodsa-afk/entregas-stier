import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { podeGerenciarUsuariosPorPapel, hashPassword, senhaValida, MENSAGEM_REGRA_SENHA } from "@/lib/auth";

const SELECT_SEGURO = {
  id: true,
  username: true,
  nome: true,
  papel: true,
  tipoConta: true,
  transportadorNome: true,
  podeCriarUsuarios: true,
  precisaTrocarSenha: true,
  ativo: true,
  criadoPor: true,
  criadoEm: true,
};

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const papel = (req.headers.get("x-user-papel") ?? "TRANSPORTADOR") as
    | "MASTER"
    | "ADMIN"
    | "ANALISTA"
    | "TRANSPORTADOR";
  const podeCriarUsuarios = req.headers.get("x-user-pode-criar-usuarios") === "1";
  if (!podeGerenciarUsuariosPorPapel(papel, podeCriarUsuarios)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const usuario = await prisma.usuario.findUnique({ where: { id: params.id } });
  if (!usuario) {
    return NextResponse.json({ erro: "Usuário não encontrado" }, { status: 404 });
  }
  if (usuario.papel === "MASTER") {
    return NextResponse.json({ erro: "O acesso master não pode ser alterado por aqui" }, { status: 400 });
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "Requisição inválida" }, { status: 400 });
  }

  if (body.acao === "redefinirSenha") {
    const novaSenha = String(body.novaSenha ?? "");
    const confirmarSenha = String(body.confirmarSenha ?? "");
    if (novaSenha !== confirmarSenha) {
      return NextResponse.json({ erro: "As senhas não coincidem" }, { status: 400 });
    }
    if (!senhaValida(novaSenha)) {
      return NextResponse.json({ erro: MENSAGEM_REGRA_SENHA }, { status: 400 });
    }
    const atualizado = await prisma.usuario.update({
      where: { id: params.id },
      data: { senhaHash: await hashPassword(novaSenha), precisaTrocarSenha: true },
      select: SELECT_SEGURO,
    });
    return NextResponse.json(atualizado);
  }

  if (body.acao !== "desativar" && body.acao !== "reativar") {
    return NextResponse.json({ erro: "Ação desconhecida" }, { status: 400 });
  }

  const atualizado = await prisma.usuario.update({
    where: { id: params.id },
    data: { ativo: body.acao === "reativar" },
    select: SELECT_SEGURO,
  });

  return NextResponse.json(atualizado);
}

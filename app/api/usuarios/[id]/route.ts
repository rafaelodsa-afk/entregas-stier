import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { podeGerenciarUsuariosPorPapel } from "@/lib/auth";

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
    return NextResponse.json({ erro: "O acesso master não pode ser desativado" }, { status: 400 });
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "Requisição inválida" }, { status: 400 });
  }

  if (body.acao !== "desativar" && body.acao !== "reativar") {
    return NextResponse.json({ erro: "Ação desconhecida" }, { status: 400 });
  }

  const atualizado = await prisma.usuario.update({
    where: { id: params.id },
    data: { ativo: body.acao === "reativar" },
    select: {
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
    },
  });

  return NextResponse.json(atualizado);
}

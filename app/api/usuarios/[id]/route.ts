import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { podeGerenciarUsuariosPorPapel, hashPassword, senhaValida, MENSAGEM_REGRA_SENHA, type Papel } from "@/lib/auth";
import { normalizarNomeTransportador } from "@/lib/transportador";

const TIPOS_CONTA = ["TRANSPORTADOR", "MOTORISTA"];

// Papéis que podem ser atribuídos editando um usuário. MASTER fica fora de
// propósito: é único, vem do seed, e o PATCH já barra qualquer alteração nele.
const PAPEIS_EDITAVEIS = ["ADMIN", "ANALISTA", "ANALISTA_ROTAS", "TRANSPORTADOR"];

// Motorista da frota própria é vinculado pelo nome da pessoa (pode trocar de
// veículo) — o prefixo é obrigatório e sempre igual, pra nunca quebrar o
// isolamento de pedidos por um erro de digitação vindo direto da API.
const PREFIXO_FROTA_PROPRIA = "Frota Própria – ";

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
  const papel = (req.headers.get("x-user-papel") ?? "TRANSPORTADOR") as Papel;
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

  if (body.acao === "editar") {
    const nome = String(body.nome ?? "").trim();
    if (!nome) {
      return NextResponse.json({ erro: "Informe o nome" }, { status: 400 });
    }
    const data: Record<string, any> = { nome };

    // Trocar o papel é opcional: quando "papel" não vem no pedido, o atual é
    // mantido (assim quem só renomeia alguém não muda permissão sem querer).
    const papelNovo =
      body.papel === undefined || body.papel === null || String(body.papel).trim() === ""
        ? usuario.papel
        : String(body.papel).trim().toUpperCase();
    if (papelNovo !== usuario.papel) {
      if (!PAPEIS_EDITAVEIS.includes(papelNovo)) {
        return NextResponse.json({ erro: "Papel inválido" }, { status: 400 });
      }
      data.papel = papelNovo;
      // Gerenciar usuários é permissão exclusiva de ADMIN — cai junto quando
      // a pessoa deixa de ser admin, pra não ficar um acesso órfão.
      if (papelNovo !== "ADMIN") data.podeCriarUsuarios = false;
    }

    if (papelNovo === "TRANSPORTADOR") {
      const tipoConta = String(body.tipoConta ?? "").trim().toUpperCase();
      let transportadorNome = String(body.transportadorNome ?? "").trim();
      if (!TIPOS_CONTA.includes(tipoConta)) {
        return NextResponse.json({ erro: "Selecione o tipo de conta do transportador" }, { status: 400 });
      }
      if (tipoConta === "MOTORISTA" && !transportadorNome.startsWith(PREFIXO_FROTA_PROPRIA)) {
        transportadorNome = `${PREFIXO_FROTA_PROPRIA}${transportadorNome}`.trim();
      }
      const nomeMotoristaVazio = tipoConta === "MOTORISTA" && transportadorNome.trim() === PREFIXO_FROTA_PROPRIA.trim();
      if (!transportadorNome || nomeMotoristaVazio) {
        return NextResponse.json({ erro: "Informe o nome do transportador" }, { status: 400 });
      }
      data.tipoConta = tipoConta;
      data.transportadorNome = normalizarNomeTransportador(transportadorNome);
    } else if (usuario.papel === "TRANSPORTADOR") {
      // Deixou de ser transportador: desfaz o vínculo, senão sobraria um nome
      // de transportador pendurado num acesso que agora enxerga tudo.
      data.tipoConta = null;
      data.transportadorNome = null;
    }
    const atualizado = await prisma.usuario.update({ where: { id: params.id }, data, select: SELECT_SEGURO });
    return NextResponse.json(atualizado);
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

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const papel = (req.headers.get("x-user-papel") ?? "TRANSPORTADOR") as Papel;
  const podeCriarUsuarios = req.headers.get("x-user-pode-criar-usuarios") === "1";
  if (!podeGerenciarUsuariosPorPapel(papel, podeCriarUsuarios)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const usuario = await prisma.usuario.findUnique({ where: { id: params.id } });
  if (!usuario) {
    return NextResponse.json({ erro: "Usuário não encontrado" }, { status: 404 });
  }
  if (usuario.papel === "MASTER") {
    return NextResponse.json({ erro: "O acesso master não pode ser excluído" }, { status: 400 });
  }

  await prisma.usuario.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}

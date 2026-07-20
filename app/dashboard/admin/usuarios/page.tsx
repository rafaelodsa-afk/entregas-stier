import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, COOKIE_NAME, podeGerenciarUsuariosPorPapel } from "@/lib/auth";
import { prisma } from "@/lib/db";
import UsuariosAdmin from "@/components/UsuariosAdmin";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const token = cookies().get(COOKIE_NAME)?.value;
  const sessao = token ? await verifySession(token) : null;
  if (!sessao || !podeGerenciarUsuariosPorPapel(sessao.papel, sessao.podeCriarUsuarios)) {
    redirect("/dashboard");
  }

  const usuarios = await prisma.usuario.findMany({
    select: {
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
    },
    orderBy: { criadoEm: "desc" },
  });

  return (
    <div>
      <h1 className="page-title">Gerenciar usuários</h1>
      <p className="page-sub">Crie novos acessos ou desative acessos que não devem mais entrar no sistema.</p>
      <UsuariosAdmin usuariosIniciais={usuarios} />
    </div>
  );
}

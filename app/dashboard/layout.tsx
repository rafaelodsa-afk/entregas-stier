import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { verifySession, COOKIE_NAME, podeGerenciarUsuariosPorPapel, podeVerTudo } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const token = cookies().get(COOKIE_NAME)?.value;
  const sessao = token ? await verifySession(token) : null;
  if (!sessao) redirect("/login");

  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="brand">STIER · Controle de Entregas</span>
        <div className="user-info">
          {podeVerTudo(sessao.papel) && (
            <Link className="btn-ghost" href="/dashboard/admin/graficos">
              Gráficos
            </Link>
          )}
          {podeGerenciarUsuariosPorPapel(sessao.papel, sessao.podeCriarUsuarios) && (
            <Link className="btn-ghost" href="/dashboard/admin/usuarios">
              Usuários
            </Link>
          )}
          <span>{sessao.nome}</span>
          <LogoutButton />
        </div>
      </header>
      {sessao.papel === "ANALISTA" && (
        <div className="somente-leitura-aviso">
          Acesso de analista — vê e atualiza pedidos normalmente; só não gerencia usuários.
        </div>
      )}
      <main>{children}</main>
    </div>
  );
}

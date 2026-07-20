import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, COOKIE_NAME, podeGerenciarUsuariosPorPapel, podeVerTudo } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";
import NavTabs from "@/components/NavTabs";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const token = cookies().get(COOKIE_NAME)?.value;
  const sessao = token ? await verifySession(token) : null;
  if (!sessao) redirect("/login");

  const abas = [];
  if (podeVerTudo(sessao.papel)) {
    abas.push({ href: "/dashboard/admin", label: "Pedidos" });
    abas.push({ href: "/dashboard/admin/graficos", label: "Gráficos" });
    abas.push({ href: "/dashboard/admin/financeiro", label: "Financeiro" });
  }
  if (podeGerenciarUsuariosPorPapel(sessao.papel, sessao.podeCriarUsuarios)) {
    abas.push({ href: "/dashboard/admin/usuarios", label: "Usuários" });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="brand">STIER · Controle de Entregas</span>
        <div className="user-info">
          <span>{sessao.nome}</span>
          <LogoutButton />
        </div>
      </header>
      {abas.length > 0 && <NavTabs abas={abas} />}
      {sessao.papel === "ANALISTA" && (
        <div className="somente-leitura-aviso">
          Acesso de analista — vê e atualiza pedidos normalmente; só não gerencia usuários.
        </div>
      )}
      <main>{children}</main>
    </div>
  );
}

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Image from "next/image";
import { verifySession, COOKIE_NAME, podeGerenciarUsuariosPorPapel, podeVerTudo } from "@/lib/auth";
import { prisma } from "@/lib/db";
import LogoutButton from "@/components/LogoutButton";
import NavTabs from "@/components/NavTabs";
import AlterarMinhaSenha from "@/components/AlterarMinhaSenha";
import RefreshButton from "@/components/RefreshButton";
import ThemeToggle from "@/components/ThemeToggle";
import AlertaReentrega from "@/components/AlertaReentrega";
import AlertaProblema from "@/components/AlertaProblema";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const token = cookies().get(COOKIE_NAME)?.value;
  const sessao = token ? await verifySession(token) : null;
  if (!sessao) redirect("/login");

  const podeVerAlerta = podeVerTudo(sessao.papel);
  const [reentregasPendentes, pedidosComAlertaProblema] = podeVerAlerta
    ? await Promise.all([
        prisma.pedido.count({ where: { statusEntrega: "REENTREGA" } }),
        prisma.pedido.count({ where: { alertaProblema: true } }),
      ])
    : [0, 0];

  const abas = [];
  if (podeVerTudo(sessao.papel)) {
    abas.push({ href: "/dashboard/admin", label: "Pedidos" });
    abas.push({ href: "/dashboard/admin/graficos", label: "Gráficos" });
    abas.push({ href: "/dashboard/admin/financeiro", label: "Financeiro" });
    abas.push({ href: "/dashboard/admin/armazenamento", label: "Armazenamento" });
  }
  if (podeGerenciarUsuariosPorPapel(sessao.papel, sessao.podeCriarUsuarios)) {
    abas.push({ href: "/dashboard/admin/usuarios", label: "Usuários" });
  }
  if (sessao.papel === "TRANSPORTADOR") {
    abas.push({ href: "/dashboard/operador", label: "Pedidos" });
    abas.push({ href: "/dashboard/operador/painel", label: "Painel" });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="brand">
          <Image src="/logo-stier.png" alt="Stier" width={700} height={160} priority className="logo-adaptavel" />
          <span className="brand-texto">Controle de Entregas</span>
        </span>
        <div className="user-info">
          <span>{sessao.nome}</span>
          <RefreshButton />
          <AlterarMinhaSenha />
          <ThemeToggle />
          <LogoutButton />
        </div>
      </header>
      {abas.length > 0 && <NavTabs abas={abas} />}
      {podeVerAlerta && <AlertaReentrega quantidade={reentregasPendentes} />}
      {podeVerAlerta && <AlertaProblema quantidade={pedidosComAlertaProblema} />}
      {sessao.papel === "ANALISTA" && (
        <div className="somente-leitura-aviso">
          Acesso de analista — vê e atualiza pedidos normalmente; só não gerencia usuários.
        </div>
      )}
      <main>{children}</main>
    </div>
  );
}

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
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

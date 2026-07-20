import { NextRequest, NextResponse } from "next/server";
import { verifySession, COOKIE_NAME } from "@/lib/auth";

// Rotas que qualquer visitante (sem login) pode acessar.
const CAMINHOS_PUBLICOS = ["/login", "/api/auth/login", "/api/auth/trocar-senha-publica"];

// Rotas permitidas mesmo quando a senha precisa ser trocada antes de
// liberar o resto do sistema (senão a pessoa ficaria presa sem conseguir
// nem trocar a senha nem sair).
const CAMINHOS_TROCA_OBRIGATORIA = ["/trocar-senha", "/api/auth/trocar-senha-obrigatoria", "/api/auth/logout"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (CAMINHOS_PUBLICOS.some((c) => pathname.startsWith(c))) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  const sessao = token ? await verifySession(token) : null;

  if (!sessao) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  if (sessao.precisaTrocarSenha && !CAMINHOS_TROCA_OBRIGATORIA.some((c) => pathname.startsWith(c))) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ erro: "É necessário trocar a senha antes de continuar", precisaTrocarSenha: true }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/trocar-senha", req.url));
  }

  // Repassa os dados da sessão já verificada para as rotas via headers,
  // para as API routes não precisarem reabrir/revalidar o cookie sozinhas.
  const headers = new Headers(req.headers);
  headers.set("x-user-id", sessao.userId);
  headers.set("x-user-username", sessao.username);
  headers.set("x-user-papel", sessao.papel);
  headers.set("x-user-nome", sessao.nome);
  headers.set("x-user-transportador", sessao.transportadorNome ?? "");
  headers.set("x-user-pode-criar-usuarios", sessao.podeCriarUsuarios ? "1" : "0");

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*", "/trocar-senha"],
};

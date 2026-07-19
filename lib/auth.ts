import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";

// Em produção, defina JWT_SECRET como uma variável de ambiente própria
// (gere com: openssl rand -base64 32). Este valor de fallback é só para
// não quebrar em desenvolvimento local sem configuração — nunca confie nele.
const secretTexto = process.env.JWT_SECRET || "troque-este-segredo-em-producao-veja-o-env-example";
const JWT_SECRET = new TextEncoder().encode(secretTexto);
const NOME_COOKIE = "stier_session";

export async function hashPassword(senha: string): Promise<string> {
  return bcrypt.hash(senha, 12);
}

export async function verifyPassword(senha: string, hash: string): Promise<boolean> {
  return bcrypt.compare(senha, hash);
}

export type SessionPayload = {
  userId: string;
  username: string;
  papel: "MASTER" | "ADMIN" | "ANALISTA" | "TRANSPORTADOR";
  nome: string;
  transportadorNome: string | null;
};

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(JWT_SECRET);
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export const COOKIE_NAME = NOME_COOKIE;

// Papéis que enxergam todos os pedidos (não só os do próprio transportador).
export function podeVerTudo(papel: SessionPayload["papel"]): boolean {
  return papel === "MASTER" || papel === "ADMIN" || papel === "ANALISTA";
}

// Papéis que podem gerenciar usuários (criar/desativar acessos).
export function podeGerenciarUsuariosPorPapel(papel: SessionPayload["papel"], podeCriarUsuarios: boolean): boolean {
  if (papel === "MASTER") return true;
  if (papel === "ADMIN") return podeCriarUsuarios;
  return false;
}

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
  podeCriarUsuarios: boolean;
  precisaTrocarSenha: boolean;
};

export const MENSAGEM_REGRA_SENHA = "A senha precisa ter pelo menos 4 letras e 4 números";

// Regra pedida: no mínimo 4 letras e 4 números (em qualquer ordem/posição).
export function senhaValida(senha: string): boolean {
  const letras = senha.match(/[a-zA-Z]/g)?.length ?? 0;
  const numeros = senha.match(/[0-9]/g)?.length ?? 0;
  return letras >= 4 && numeros >= 4;
}

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

// Excluir um mês inteiro de pedidos é irreversível e em lote — mais
// restrito que as outras exclusões do sistema (que incluem ANALISTA).
export function podeExcluirMes(papel: SessionPayload["papel"]): boolean {
  return papel === "MASTER" || papel === "ADMIN";
}

// Marcar um pedido legado como entregue sem canhoto pula uma trava
// importante do fluxo normal — só master/admin, nunca analista.
export function podeFinalizarSemCanhoto(papel: SessionPayload["papel"]): boolean {
  return papel === "MASTER" || papel === "ADMIN";
}

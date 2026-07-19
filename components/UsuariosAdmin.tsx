"use client";

import { useState, FormEvent } from "react";

type Usuario = {
  id: string;
  username: string;
  nome: string;
  papel: "MASTER" | "ADMIN" | "ANALISTA" | "TRANSPORTADOR";
  tipoConta: "TRANSPORTADOR" | "MOTORISTA" | null;
  transportadorNome: string | null;
  podeCriarUsuarios: boolean;
  ativo: boolean;
  criadoPor: string | null;
  criadoEm: string;
};

const LABEL_PAPEL: Record<string, string> = {
  MASTER: "Master",
  ADMIN: "Admin",
  ANALISTA: "Analista",
  TRANSPORTADOR: "Transportador",
};

const VAZIO = {
  username: "",
  senha: "",
  nome: "",
  papel: "TRANSPORTADOR",
  tipoConta: "TRANSPORTADOR",
  transportadorNome: "",
  podeCriarUsuarios: false,
};

export default function UsuariosAdmin({ usuariosIniciais }: { usuariosIniciais: Usuario[] }) {
  const [usuarios, setUsuarios] = useState(usuariosIniciais);
  const [form, setForm] = useState(VAZIO);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState("");
  const [idEmAcao, setIdEmAcao] = useState<string | null>(null);

  async function criarUsuario(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setCriando(true);
    try {
      const res = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(data.erro || "Não foi possível criar o usuário.");
        return;
      }
      setUsuarios((atual) => [data, ...atual]);
      setForm(VAZIO);
    } catch (err) {
      console.error(err);
      setErro("Erro de conexão.");
    } finally {
      setCriando(false);
    }
  }

  async function alternarAtivo(usuario: Usuario) {
    setErro("");
    setIdEmAcao(usuario.id);
    try {
      const res = await fetch(`/api/usuarios/${usuario.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: usuario.ativo ? "desativar" : "reativar" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(data.erro || "Não foi possível atualizar o usuário.");
        return;
      }
      setUsuarios((atual) => atual.map((u) => (u.id === data.id ? data : u)));
    } catch (err) {
      console.error(err);
      setErro("Erro de conexão.");
    } finally {
      setIdEmAcao(null);
    }
  }

  return (
    <div>
      <form className="form-card" onSubmit={criarUsuario}>
        <h2>Novo acesso</h2>
        <div className="form-grid">
          <label>
            Usuário (login)
            <input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              autoCapitalize="none"
              required
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              value={form.senha}
              onChange={(e) => setForm({ ...form, senha: e.target.value })}
              required
              minLength={6}
            />
          </label>
          <label>
            Nome completo
            <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
          </label>
          <label>
            Papel
            <select value={form.papel} onChange={(e) => setForm({ ...form, papel: e.target.value })}>
              <option value="TRANSPORTADOR">Transportador / Motorista</option>
              <option value="ANALISTA">Analista Stier</option>
              <option value="ADMIN">Admin</option>
            </select>
          </label>
          {form.papel === "TRANSPORTADOR" && (
            <>
              <label>
                Tipo de conta
                <select value={form.tipoConta} onChange={(e) => setForm({ ...form, tipoConta: e.target.value })}>
                  <option value="TRANSPORTADOR">Transportador terceirizado</option>
                  <option value="MOTORISTA">Motorista da frota própria</option>
                </select>
              </label>
              <label>
                Nome do transportador
                <input
                  value={form.transportadorNome}
                  onChange={(e) => setForm({ ...form, transportadorNome: e.target.value })}
                  placeholder="Ex.: Rudimar, Frota Própria – Master"
                  required
                />
              </label>
            </>
          )}
          {form.papel === "ADMIN" && (
            <label className="checkbox-linha">
              <input
                type="checkbox"
                checked={form.podeCriarUsuarios}
                onChange={(e) => setForm({ ...form, podeCriarUsuarios: e.target.checked })}
              />
              Pode gerenciar usuários (criar/desativar acessos)
            </label>
          )}
        </div>
        {erro && <p className="erro">{erro}</p>}
        <button type="submit" disabled={criando}>
          {criando ? "Criando..." : "Criar acesso"}
        </button>
      </form>

      <table className="pedidos-table usuarios-table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Usuário</th>
            <th>Papel</th>
            <th>Transportador</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => (
            <tr key={u.id}>
              <td>{u.nome}</td>
              <td>{u.username}</td>
              <td>{LABEL_PAPEL[u.papel] ?? u.papel}</td>
              <td>{u.transportadorNome || "—"}</td>
              <td>
                <span className={`badge ${u.ativo ? "badge-ativo" : "badge-inativo"}`}>
                  {u.ativo ? "Ativo" : "Desativado"}
                </span>
              </td>
              <td>
                {u.papel !== "MASTER" && (
                  <button
                    className="btn-ghost"
                    disabled={idEmAcao === u.id}
                    onClick={() => alternarAtivo(u)}
                  >
                    {idEmAcao === u.id ? "..." : u.ativo ? "Desativar" : "Reativar"}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

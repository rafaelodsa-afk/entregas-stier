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
  precisaTrocarSenha: boolean;
  ativo: boolean;
  criadoPor: string | null;
  criadoEm: Date;
};

const LABEL_PAPEL: Record<string, string> = {
  MASTER: "Master",
  ADMIN: "Admin",
  ANALISTA: "Analista",
  TRANSPORTADOR: "Transportador",
};

const DICA_SENHA = "Mínimo 4 letras e 4 números";

const VAZIO = {
  username: "",
  senha: "",
  confirmarSenha: "",
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

  const [redefinindoId, setRedefinindoId] = useState<string | null>(null);
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarNovaSenha, setConfirmarNovaSenha] = useState("");
  const [erroRedefinicao, setErroRedefinicao] = useState("");
  const [salvandoSenha, setSalvandoSenha] = useState(false);

  async function criarUsuario(e: FormEvent) {
    e.preventDefault();
    setErro("");
    if (form.senha !== form.confirmarSenha) {
      setErro("As senhas não coincidem.");
      return;
    }
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

  function abrirRedefinicao(id: string) {
    setRedefinindoId(id);
    setNovaSenha("");
    setConfirmarNovaSenha("");
    setErroRedefinicao("");
  }

  function cancelarRedefinicao() {
    setRedefinindoId(null);
    setNovaSenha("");
    setConfirmarNovaSenha("");
    setErroRedefinicao("");
  }

  async function salvarRedefinicao(id: string) {
    setErroRedefinicao("");
    if (novaSenha !== confirmarNovaSenha) {
      setErroRedefinicao("As senhas não coincidem.");
      return;
    }
    setSalvandoSenha(true);
    try {
      const res = await fetch(`/api/usuarios/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "redefinirSenha", novaSenha, confirmarSenha: confirmarNovaSenha }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErroRedefinicao(data.erro || "Não foi possível redefinir a senha.");
        return;
      }
      setUsuarios((atual) => atual.map((u) => (u.id === data.id ? data : u)));
      cancelarRedefinicao();
    } catch (err) {
      console.error(err);
      setErroRedefinicao("Erro de conexão.");
    } finally {
      setSalvandoSenha(false);
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
            Senha provisória
            <input
              type="password"
              value={form.senha}
              onChange={(e) => setForm({ ...form, senha: e.target.value })}
              required
            />
            <span className="dica-campo">{DICA_SENHA}</span>
          </label>
          <label>
            Confirmar senha
            <input
              type="password"
              value={form.confirmarSenha}
              onChange={(e) => setForm({ ...form, confirmarSenha: e.target.value })}
              required
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
        <p className="page-sub" style={{ marginTop: 8 }}>
          A pessoa vai precisar trocar essa senha provisória assim que fizer o primeiro login.
        </p>
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
                {u.precisaTrocarSenha && (
                  <span className="badge" style={{ marginLeft: 6 }}>
                    Precisa trocar senha
                  </span>
                )}
              </td>
              <td>
                {u.papel !== "MASTER" && (
                  <div className="acoes-linha">
                    <button className="btn-ghost" disabled={idEmAcao === u.id} onClick={() => alternarAtivo(u)}>
                      {idEmAcao === u.id ? "..." : u.ativo ? "Desativar" : "Reativar"}
                    </button>
                    <button className="btn-ghost" onClick={() => abrirRedefinicao(u.id)}>
                      Redefinir senha
                    </button>
                  </div>
                )}
                {redefinindoId === u.id && (
                  <div className="form-card" style={{ marginTop: 10, padding: 14 }}>
                    <div className="form-grid">
                      <label>
                        Nova senha provisória
                        <input
                          type="password"
                          value={novaSenha}
                          onChange={(e) => setNovaSenha(e.target.value)}
                          autoFocus
                        />
                        <span className="dica-campo">{DICA_SENHA}</span>
                      </label>
                      <label>
                        Confirmar nova senha
                        <input
                          type="password"
                          value={confirmarNovaSenha}
                          onChange={(e) => setConfirmarNovaSenha(e.target.value)}
                        />
                      </label>
                    </div>
                    {erroRedefinicao && <p className="erro" style={{ marginTop: 8 }}>{erroRedefinicao}</p>}
                    <div className="acoes-linha" style={{ marginTop: 10 }}>
                      <button disabled={salvandoSenha} onClick={() => salvarRedefinicao(u.id)}>
                        {salvandoSenha ? "Salvando..." : "Salvar nova senha"}
                      </button>
                      <button className="btn-ghost" disabled={salvandoSenha} onClick={cancelarRedefinicao}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

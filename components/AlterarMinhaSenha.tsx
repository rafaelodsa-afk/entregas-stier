"use client";

import { useState, FormEvent } from "react";

export default function AlterarMinhaSenha() {
  const [aberto, setAberto] = useState(false);
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState(false);
  const [salvando, setSalvando] = useState(false);

  function abrir() {
    setAberto(true);
    setSenhaAtual("");
    setNovaSenha("");
    setConfirmarSenha("");
    setErro("");
    setSucesso(false);
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setSucesso(false);
    if (novaSenha !== confirmarSenha) {
      setErro("A nova senha e a confirmação não coincidem.");
      return;
    }
    setSalvando(true);
    try {
      const res = await fetch("/api/auth/trocar-minha-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senhaAtual, novaSenha, confirmarSenha }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(data.erro || "Não foi possível trocar a senha.");
        return;
      }
      setSucesso(true);
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmarSenha("");
    } catch (err) {
      console.error(err);
      setErro("Erro de conexão.");
    } finally {
      setSalvando(false);
    }
  }

  if (!aberto) {
    return (
      <div className="alterar-senha-wrap">
        <button className="btn-ghost" onClick={abrir}>
          Alterar minha senha
        </button>
      </div>
    );
  }

  return (
    <div className="alterar-senha-wrap">
      <button className="btn-ghost" onClick={() => setAberto(false)}>
        Alterar minha senha
      </button>
      <div className="alterar-senha-painel">
        <form className="form-card" onSubmit={salvar}>
          <h2>Alterar minha senha</h2>
          <div className="form-grid">
            <label>
              Senha atual
              <input type="password" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} autoFocus required />
            </label>
            <label>
              Nova senha
              <input type="password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} required />
              <span className="dica-campo">Mínimo 4 letras e 4 números</span>
            </label>
            <label>
              Confirmar nova senha
              <input type="password" value={confirmarSenha} onChange={(e) => setConfirmarSenha(e.target.value)} required />
            </label>
          </div>
          {erro && <p className="erro">{erro}</p>}
          {sucesso && (
            <p className="erro" style={{ background: "rgba(63,191,143,0.12)", borderColor: "rgba(63,191,143,0.4)", color: "#8fe3c4" }}>
              Senha alterada com sucesso!
            </p>
          )}
          <div className="acoes-linha" style={{ marginTop: 10 }}>
            <button type="submit" disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar nova senha"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setAberto(false)}>
              Fechar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function TrocarSenhaObrigatoriaPage() {
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro("");
    if (novaSenha !== confirmarSenha) {
      setErro("As senhas não coincidem.");
      return;
    }
    setCarregando(true);
    try {
      const res = await fetch("/api/auth/trocar-senha-obrigatoria", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ novaSenha, confirmarSenha }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErro(data.erro || "Não foi possível trocar a senha.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      console.error(err);
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Troque sua senha</h1>
        <p className="login-sub">
          Por segurança, você precisa criar uma senha nova antes de continuar (mínimo 4 letras e 4 números).
        </p>
        {erro && <p className="erro">{erro}</p>}
        <label>
          Nova senha
          <input
            type="password"
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            autoFocus
          />
        </label>
        <label>
          Confirmar nova senha
          <input
            type="password"
            value={confirmarSenha}
            onChange={(e) => setConfirmarSenha(e.target.value)}
          />
        </label>
        <button type="submit" disabled={carregando}>
          {carregando ? "Salvando..." : "Trocar senha e entrar"}
        </button>
      </form>
    </div>
  );
}

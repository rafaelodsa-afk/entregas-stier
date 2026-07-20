"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

function Logo() {
  return (
    <div className="login-logo">
      <Image src="/logo-stier.png" alt="Stier" width={700} height={160} priority />
    </div>
  );
}

function FormularioLogin({ onTrocarSenha }: { onTrocarSenha: () => void }) {
  const [username, setUsername] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro("");
    if (!username || !senha) {
      setErro("Preencha usuário e senha.");
      return;
    }
    setCarregando(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, senha }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErro(data.erro || "Não foi possível entrar.");
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
    <form className="login-card" onSubmit={handleSubmit}>
      <Logo />
      <p className="login-sub">Controle de Entregas — acesso de transportadores, motoristas e administração</p>
      {erro && <p className="erro">{erro}</p>}
      <label>
        Usuário
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoCapitalize="none" />
      </label>
      <label>
        Senha
        <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} />
      </label>
      <button type="submit" disabled={carregando}>
        {carregando ? "Entrando..." : "Entrar"}
      </button>
      <button type="button" className="link-botao" onClick={onTrocarSenha}>
        Trocar senha
      </button>
    </form>
  );
}

function FormularioTrocarSenha({ onVoltar }: { onVoltar: () => void }) {
  const [username, setUsername] = useState("");
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState(false);
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setSucesso(false);
    if (!username || !senhaAtual || !novaSenha) {
      setErro("Preencha todos os campos.");
      return;
    }
    if (novaSenha !== confirmarSenha) {
      setErro("A nova senha e a confirmação não coincidem.");
      return;
    }
    setCarregando(true);
    try {
      const res = await fetch("/api/auth/trocar-senha-publica", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, senhaAtual, novaSenha, confirmarSenha }),
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
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <form className="login-card" onSubmit={handleSubmit}>
      <Logo />
      <p className="login-sub">Trocar senha — informe seu usuário e senha atual pra provar que é você.</p>
      {erro && <p className="erro">{erro}</p>}
      {sucesso && <p className="erro" style={{ background: "rgba(63,191,143,0.12)", borderColor: "rgba(63,191,143,0.4)", color: "#8fe3c4" }}>Senha trocada com sucesso! Já pode entrar com a nova senha.</p>}
      <label>
        Usuário
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoFocus />
      </label>
      <label>
        Senha atual
        <input type="password" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} />
      </label>
      <label>
        Nova senha
        <input type="password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} />
        <span className="dica-campo">Mínimo 4 letras e 4 números</span>
      </label>
      <label>
        Confirmar nova senha
        <input type="password" value={confirmarSenha} onChange={(e) => setConfirmarSenha(e.target.value)} />
      </label>
      <button type="submit" disabled={carregando}>
        {carregando ? "Trocando..." : "Trocar senha"}
      </button>
      <button type="button" className="link-botao" onClick={onVoltar}>
        Voltar para o login
      </button>
    </form>
  );
}

export default function LoginPage() {
  const [modo, setModo] = useState<"login" | "trocarSenha">("login");

  return (
    <div className="login-wrap">
      {modo === "login" ? (
        <FormularioLogin onTrocarSenha={() => setModo("trocarSenha")} />
      ) : (
        <FormularioTrocarSenha onVoltar={() => setModo("login")} />
      )}
    </div>
  );
}

"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

const VAZIO = {
  id: "",
  cliente: "",
  cidade: "",
  bairro: "",
  rua: "",
  numero: "",
  transportador: "",
  operacao: "VENDA",
  formaPagamento: "BOLETO",
  valorPedido: "",
  prazo: "",
  dataPrevistaEntrega: "",
};

export default function CriarPedido() {
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const router = useRouter();

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setSucesso("");
    setSalvando(true);
    try {
      const res = await fetch("/api/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(data.erro || "Não foi possível criar o pedido.");
        return;
      }
      setSucesso(`Pedido #${data.id} criado com sucesso.`);
      setForm(VAZIO);
      router.refresh();
    } catch (err) {
      console.error(err);
      setErro("Erro de conexão.");
    } finally {
      setSalvando(false);
    }
  }

  if (!aberto) {
    return (
      <button className="btn-importar" style={{ marginBottom: 16 }} onClick={() => setAberto(true)}>
        Cadastrar pedido manualmente
      </button>
    );
  }

  return (
    <form className="form-card" onSubmit={salvar}>
      <h2>Cadastrar pedido manualmente</h2>
      <div className="form-grid">
        <label>
          Nº do pedido
          <input value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} required />
        </label>
        <label>
          Cliente
          <input value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })} required />
        </label>
        <label>
          Transportador
          <input value={form.transportador} onChange={(e) => setForm({ ...form, transportador: e.target.value })} required />
        </label>
        <label>
          Cidade
          <input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
        </label>
        <label>
          Bairro
          <input value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} />
        </label>
        <label>
          Rua
          <input value={form.rua} onChange={(e) => setForm({ ...form, rua: e.target.value })} />
        </label>
        <label>
          Número
          <input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} />
        </label>
        <label>
          Operação
          <select value={form.operacao} onChange={(e) => setForm({ ...form, operacao: e.target.value })}>
            <option value="VENDA">Venda</option>
            <option value="BONIFICACAO">Bonificação</option>
            <option value="TRANSFERENCIA">Transferência</option>
            <option value="REMESSA">Remessa</option>
          </select>
        </label>
        <label>
          Forma de pagamento
          <select value={form.formaPagamento} onChange={(e) => setForm({ ...form, formaPagamento: e.target.value })}>
            <option value="BOLETO">Boleto</option>
            <option value="PIX">PIX</option>
            <option value="DINHEIRO">Dinheiro</option>
          </select>
        </label>
        <label>
          Valor
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.valorPedido}
            onChange={(e) => setForm({ ...form, valorPedido: e.target.value })}
          />
        </label>
        <label>
          Prazo
          <input value={form.prazo} onChange={(e) => setForm({ ...form, prazo: e.target.value })} placeholder="Ex.: 2 dias" />
        </label>
        <label>
          Data prevista de entrega
          <input
            type="date"
            value={form.dataPrevistaEntrega}
            onChange={(e) => setForm({ ...form, dataPrevistaEntrega: e.target.value })}
          />
        </label>
      </div>
      {erro && <p className="erro">{erro}</p>}
      {sucesso && (
        <p className="erro" style={{ background: "rgba(63,191,143,0.12)", borderColor: "rgba(63,191,143,0.4)", color: "var(--teal)" }}>
          {sucesso}
        </p>
      )}
      <div className="acoes-linha" style={{ marginTop: 10 }}>
        <button type="submit" disabled={salvando}>
          {salvando ? "Salvando..." : "Criar pedido"}
        </button>
        <button type="button" className="btn-ghost" onClick={() => setAberto(false)}>
          Fechar
        </button>
      </div>
    </form>
  );
}

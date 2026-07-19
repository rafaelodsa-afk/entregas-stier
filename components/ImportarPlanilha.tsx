"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Resultado = {
  criados: number;
  atualizados: number;
  erros: { linha: number; motivo: string }[];
};

export default function ImportarPlanilha() {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [erroGeral, setErroGeral] = useState("");
  const router = useRouter();

  async function importar() {
    if (!arquivo) return;
    setEnviando(true);
    setErroGeral("");
    setResultado(null);
    try {
      const formData = new FormData();
      formData.append("arquivo", arquivo);
      const res = await fetch("/api/pedidos/importar", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setErroGeral(data.erro || "Não foi possível importar a planilha.");
        return;
      }
      setResultado(data);
      setArquivo(null);
      router.refresh();
    } catch (err) {
      console.error(err);
      setErroGeral("Erro de conexão.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="form-card">
      <h2>Importar pedidos por planilha</h2>
      <p className="page-sub" style={{ marginBottom: 12 }}>
        Envie um arquivo .xlsx ou .csv com as colunas: Nº Pedido, Cliente, Cidade, Bairro, Rua, Número,
        Transportador, Forma de Pagamento, Valor, Prazo.{" "}
        <a className="link-canhoto" href="/modelo-pedidos.csv" download>
          Baixar planilha modelo
        </a>
      </p>
      <div className="canhoto-upload">
        <label className="canhoto-input-label">
          {arquivo ? arquivo.name : "Escolher planilha (.xlsx ou .csv)"}
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            hidden
          />
        </label>
        <button className="btn-importar" onClick={importar} disabled={!arquivo || enviando}>
          {enviando ? "Importando..." : "Importar"}
        </button>
      </div>
      {erroGeral && <p className="erro" style={{ marginTop: 10 }}>{erroGeral}</p>}
      {resultado && (
        <div className="resultado-import">
          <p>
            {resultado.criados} pedido(s) criado(s), {resultado.atualizados} atualizado(s)
            {resultado.erros.length > 0 && `, ${resultado.erros.length} com erro`}.
          </p>
          {resultado.erros.length > 0 && (
            <ul className="erros-import">
              {resultado.erros.map((e, i) => (
                <li key={i}>Linha {e.linha}: {e.motivo}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

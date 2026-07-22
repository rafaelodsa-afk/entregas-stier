"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type LinhaImportada = {
  linha: number;
  id?: unknown;
  cliente?: unknown;
  cidade?: unknown;
  bairro?: unknown;
  rua?: unknown;
  numero?: unknown;
  transportador?: unknown;
  operacao?: unknown;
  formaPagamento?: unknown;
  valorPedido?: unknown;
  prazo?: unknown;
  statusEntregaPlanilha?: unknown;
  dataPedido?: unknown;
  dataPrevistaEntrega?: unknown;
};

type Resumo = {
  novos: number;
  novosAguardandoCanhoto: number;
  novosCancelados: number;
  reatribuidos: number;
  canceladosPlanilha: number;
  aguardandoCanhoto: number;
  protegidos: { linha: number; id: string | null; motivo: string }[];
  semMudancaOperacional: number;
  ignorados: { linha: number; id: string | null; motivo: string }[];
};

// Faixa Unicode das marcas de acento combinantes (0x0300–0x036F), usada
// depois de normalizar a string em NFD para remover acentos (café -> cafe).
const REGEX_ACENTOS = new RegExp(String.fromCharCode(0x5b) + "\\u0300-\\u036f" + String.fromCharCode(0x5d), "g");

function normalizarChave(chave: string) {
  return chave.normalize("NFD").replace(REGEX_ACENTOS, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Aceita variações comuns de como a planilha real da Stier (e outras) nomeia
// essas colunas — ignorando acentuação, maiúsculas e pequenas diferenças de
// redação.
// Cliente tem duas colunas possíveis na planilha real — Nome Fantasia/
// Apelido é o nome preferido (mais reconhecível no dia a dia), com Razão
// Social como alternativa só quando a primeira vier vazia numa linha. Por
// isso os dois têm campos próprios aqui (clienteNomeFantasia/
// clienteRazaoSocial) — são resolvidos num "cliente" só depois de mapear
// todas as colunas, em resolverCliente().
const MAPA_COLUNAS: Record<string, string> = {
  npedido: "id",
  numeropedido: "id",
  nrpedido: "id",
  pedido: "id",
  id: "id",
  cliente: "clienteRazaoSocial",
  clienterazaosocialnome: "clienteRazaoSocial",
  razaosocial: "clienteRazaoSocial",
  clientenomefantasiaapelido: "clienteNomeFantasia",
  nomefantasiaapelido: "clienteNomeFantasia",
  nomefantasia: "clienteNomeFantasia",
  apelido: "clienteNomeFantasia",
  cidade: "cidade",
  bairro: "bairro",
  rua: "rua",
  endereco: "rua",
  n: "numero",
  numero: "numero",
  nrendereco: "numero",
  transportador: "transportador",
  operacao: "operacao",
  tipodeoperacao: "operacao",
  formadepagamento: "formaPagamento",
  formapagamento: "formaPagamento",
  pagamento: "formaPagamento",
  valor: "valorPedido",
  valordopedido: "valorPedido",
  valorpedido: "valorPedido",
  prazo: "prazo",
  data: "dataPedido",
  datadopedido: "dataPedido",
  statusdeentrega: "statusEntregaPlanilha",
  status: "statusEntregaPlanilha",
  preventrega: "dataPrevistaEntrega",
  previsaodeentrega: "dataPrevistaEntrega",
  previsaoentrega: "dataPrevistaEntrega",
  dataprevista: "dataPrevistaEntrega",
  dataprevistadeentrega: "dataPrevistaEntrega",
  dataprevistaentrega: "dataPrevistaEntrega",
  datadeentregaprevista: "dataPrevistaEntrega",
  entregaprevista: "dataPrevistaEntrega",
};

async function lerArquivoNoNavegador(arquivo: File): Promise<Record<string, any>[]> {
  // Carregada só quando alguém realmente for importar uma planilha, pra não
  // engordar o carregamento inicial da página de pedidos com essa biblioteca.
  const XLSX = await import("xlsx");

  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    leitor.onload = () => {
      try {
        const ehCsv = arquivo.name.toLowerCase().endsWith(".csv") || arquivo.type === "text/csv";
        const conteudo = leitor.result as ArrayBuffer;
        // .csv é lido como texto UTF-8 explicitamente — se for lido como
        // binário (como .xlsx), o parser interpreta acentos com a codificação errada.
        const planilha = ehCsv
          ? XLSX.read(new TextDecoder("utf-8").decode(conteudo), { type: "string" })
          : XLSX.read(conteudo, { type: "array" });
        const primeiraAba = planilha.Sheets[planilha.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json<Record<string, any>>(primeiraAba, { defval: "" }));
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Arquivo inválido."));
      }
    };
    leitor.readAsArrayBuffer(arquivo);
  });
}

function mapearLinhas(linhasCru: Record<string, any>[]): LinhaImportada[] {
  return linhasCru.map((linhaCru, i) => {
    const linha: LinhaImportada = { linha: i + 2 }; // +2: cabeçalho ocupa a linha 1
    for (const [chave, valor] of Object.entries(linhaCru)) {
      const campo = MAPA_COLUNAS[normalizarChave(chave)];
      if (campo) (linha as any)[campo] = valor;
    }
    // Nome Fantasia/Apelido tem prioridade — Razão Social só entra quando
    // a primeira vier vazia nessa linha específica.
    const nomeFantasia = String((linha as any).clienteNomeFantasia ?? "").trim();
    const razaoSocial = String((linha as any).clienteRazaoSocial ?? "").trim();
    linha.cliente = nomeFantasia || razaoSocial;
    delete (linha as any).clienteNomeFantasia;
    delete (linha as any).clienteRazaoSocial;
    return linha;
  });
}

export default function ImportarPlanilha() {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [linhas, setLinhas] = useState<LinhaImportada[] | null>(null);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [concluido, setConcluido] = useState<Resumo | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erroGeral, setErroGeral] = useState("");
  const router = useRouter();

  function limpar() {
    setArquivo(null);
    setLinhas(null);
    setResumo(null);
    setConcluido(null);
    setErroGeral("");
  }

  async function analisar() {
    if (!arquivo) return;
    setCarregando(true);
    setErroGeral("");
    setResumo(null);
    setConcluido(null);
    try {
      const linhasCru = await lerArquivoNoNavegador(arquivo);
      if (linhasCru.length === 0) {
        setErroGeral("A planilha está vazia.");
        return;
      }
      const linhasMapeadas = mapearLinhas(linhasCru);
      const res = await fetch("/api/pedidos/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linhas: linhasMapeadas, confirmar: false }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErroGeral(data.erro || "Não foi possível analisar a planilha.");
        return;
      }
      setLinhas(linhasMapeadas);
      setResumo(data);
    } catch (err) {
      console.error(err);
      setErroGeral(err instanceof Error ? err.message : "Erro de conexão.");
    } finally {
      setCarregando(false);
    }
  }

  async function confirmar() {
    if (!linhas) return;
    setCarregando(true);
    setErroGeral("");
    try {
      const res = await fetch("/api/pedidos/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linhas, confirmar: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErroGeral(data.erro || "Não foi possível importar a planilha.");
        return;
      }
      setConcluido(data);
      setResumo(null);
      setLinhas(null);
      setArquivo(null);
      router.refresh();
    } catch (err) {
      console.error(err);
      setErroGeral("Erro de conexão.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="form-card">
      <h2>Importar pedidos por planilha</h2>
      <p className="page-sub" style={{ marginBottom: 12 }}>
        Envie um arquivo .xlsx ou .csv com as colunas: Nº Pedido, Cliente (Razão Social/Nome e/ou Nome
        Fantasia/Apelido — o Nome Fantasia tem prioridade quando os dois vierem preenchidos), Cidade, Bairro,
        Rua, Número, Transportador, Operação, Forma de Pagamento, Valor, Prazo (e, se quiser, Data, Status de
        entrega e Prev. Entrega).{" "}
        <a className="link-canhoto" href="/modelo-pedidos.csv" download>
          Baixar planilha modelo
        </a>
      </p>

      {!resumo && (
        <div className="canhoto-upload">
          <label className="canhoto-input-label">
            {arquivo ? arquivo.name : "Escolher planilha (.xlsx ou .csv)"}
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                setArquivo(e.target.files?.[0] ?? null);
                setConcluido(null);
              }}
              hidden
            />
          </label>
          <button className="btn-importar" onClick={analisar} disabled={!arquivo || carregando}>
            {carregando ? "Analisando..." : "Analisar planilha"}
          </button>
        </div>
      )}

      {erroGeral && <p className="erro" style={{ marginTop: 10 }}>{erroGeral}</p>}

      {resumo && (
        <div className="resultado-import">
          <p>Resumo antes de confirmar:</p>
          <ul className="resumo-categorias">
            <li><strong>{resumo.novos}</strong> novo(s)</li>
            <li><strong>{resumo.novosAguardandoCanhoto}</strong> novo(s) já como "aguardando canhoto"</li>
            <li><strong>{resumo.novosCancelados}</strong> novo(s) já cancelado(s)</li>
            <li><strong>{resumo.reatribuidos}</strong> reatribuído(s) (reentrega)</li>
            <li><strong>{resumo.canceladosPlanilha}</strong> cancelado(s) pela planilha</li>
            <li><strong>{resumo.aguardandoCanhoto}</strong> mudou(aram) pra "aguardando canhoto"</li>
            <li><strong>{resumo.protegidos.length}</strong> protegido(s) sem alteração</li>
            <li><strong>{resumo.semMudancaOperacional}</strong> sem mudança operacional</li>
            <li><strong>{resumo.ignorados.length}</strong> ignorado(s) (dados incompletos)</li>
          </ul>
          {(resumo.ignorados.length > 0 || resumo.protegidos.length > 0) && (
            <ul className="erros-import">
              {resumo.protegidos.map((r, i) => (
                <li key={`p${i}`}>
                  Linha {r.linha}
                  {r.id ? ` (#${r.id})` : ""}: {r.motivo}
                </li>
              ))}
              {resumo.ignorados.map((r, i) => (
                <li key={`i${i}`}>
                  Linha {r.linha}
                  {r.id ? ` (#${r.id})` : ""}: {r.motivo}
                </li>
              ))}
            </ul>
          )}
          <div className="canhoto-upload" style={{ marginTop: 12 }}>
            <button className="btn-importar" onClick={confirmar} disabled={carregando}>
              {carregando
                ? "Importando..."
                : `Confirmar importação (${
                    resumo.novos +
                    resumo.novosAguardandoCanhoto +
                    resumo.novosCancelados +
                    resumo.reatribuidos +
                    resumo.canceladosPlanilha +
                    resumo.aguardandoCanhoto
                  } pedido(s))`}
            </button>
            <button className="btn-ghost" onClick={limpar} disabled={carregando}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {concluido && (
        <div className="resultado-import">
          <p>Importação concluída:</p>
          <ul className="resumo-categorias">
            <li><strong>{concluido.novos}</strong> criado(s)</li>
            <li><strong>{concluido.novosAguardandoCanhoto}</strong> criado(s) já como "aguardando canhoto"</li>
            <li><strong>{concluido.novosCancelados}</strong> criado(s) já cancelado(s)</li>
            <li><strong>{concluido.reatribuidos}</strong> reatribuído(s)</li>
            <li><strong>{concluido.canceladosPlanilha}</strong> cancelado(s) pela planilha</li>
            <li><strong>{concluido.aguardandoCanhoto}</strong> mudou(aram) pra "aguardando canhoto"</li>
            <li><strong>{concluido.protegidos.length}</strong> protegido(s) sem alteração</li>
            <li><strong>{concluido.semMudancaOperacional}</strong> sem mudança operacional</li>
            <li><strong>{concluido.ignorados.length}</strong> ignorado(s)</li>
          </ul>
        </div>
      )}
    </div>
  );
}

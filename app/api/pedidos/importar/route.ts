import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { podeVerTudo } from "@/lib/auth";
import { criarOuReatribuirPedido } from "@/lib/pedidos";

// Faixa Unicode das marcas de acento combinantes (0x0300–0x036F), usada
// depois de normalizar a string em NFD para remover acentos (café -> cafe).
const REGEX_ACENTOS = new RegExp(String.fromCharCode(0x5b) + "\\u0300-\\u036f" + String.fromCharCode(0x5d), "g");

function normalizarChave(chave: string) {
  return chave
    .normalize("NFD")
    .replace(REGEX_ACENTOS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Aceita variações comuns de como alguém digitaria essas colunas numa planilha.
const MAPA_COLUNAS: Record<string, string> = {
  npedido: "id",
  numeropedido: "id",
  nrpedido: "id",
  pedido: "id",
  id: "id",
  cliente: "cliente",
  cidade: "cidade",
  bairro: "bairro",
  rua: "rua",
  endereco: "rua",
  numero: "numero",
  nrendereco: "numero",
  transportador: "transportador",
  formadepagamento: "formaPagamento",
  formapagamento: "formaPagamento",
  pagamento: "formaPagamento",
  valor: "valorPedido",
  valordopedido: "valorPedido",
  valorpedido: "valorPedido",
  prazo: "prazo",
};

export async function POST(req: NextRequest) {
  const papel = (req.headers.get("x-user-papel") ?? "TRANSPORTADOR") as
    | "MASTER"
    | "ADMIN"
    | "ANALISTA"
    | "TRANSPORTADOR";
  if (!podeVerTudo(papel)) {
    return NextResponse.json({ erro: "Sem permissão para importar pedidos" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ erro: "Requisição inválida" }, { status: 400 });
  }

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File)) {
    return NextResponse.json({ erro: "Envie um arquivo .xlsx ou .csv" }, { status: 400 });
  }

  let linhas: Record<string, any>[];
  try {
    const buffer = Buffer.from(await arquivo.arrayBuffer());
    // .csv é lido como texto UTF-8 explicitamente — se for lido como binário
    // (como .xlsx), o parser interpreta acentos com a codificação errada.
    const ehCsv = arquivo.name.toLowerCase().endsWith(".csv") || arquivo.type === "text/csv";
    const planilha = ehCsv
      ? XLSX.read(buffer.toString("utf-8"), { type: "string" })
      : XLSX.read(buffer, { type: "buffer" });
    const primeiraAba = planilha.Sheets[planilha.SheetNames[0]];
    linhas = XLSX.utils.sheet_to_json(primeiraAba, { defval: "" });
  } catch {
    return NextResponse.json({ erro: "Não foi possível ler o arquivo. Confira se é um .xlsx ou .csv válido." }, { status: 400 });
  }

  if (linhas.length === 0) {
    return NextResponse.json({ erro: "A planilha está vazia" }, { status: 400 });
  }
  if (linhas.length > 500) {
    return NextResponse.json({ erro: "Envie no máximo 500 linhas por vez" }, { status: 400 });
  }

  const nomeUsuario = req.headers.get("x-user-nome") ?? "sistema";
  let criados = 0;
  let atualizados = 0;
  const erros: { linha: number; motivo: string }[] = [];

  for (let i = 0; i < linhas.length; i++) {
    const linhaMapeada: Record<string, any> = {};
    for (const [chave, valor] of Object.entries(linhas[i])) {
      const campo = MAPA_COLUNAS[normalizarChave(chave)];
      if (campo) linhaMapeada[campo] = valor;
    }

    const resultado = await criarOuReatribuirPedido(linhaMapeada, nomeUsuario);
    if (!resultado.ok) {
      erros.push({ linha: i + 2, motivo: resultado.erro }); // +2: cabeçalho ocupa a linha 1
      continue;
    }
    if (resultado.criado) criados++;
    else atualizados++;
  }

  return NextResponse.json({ criados, atualizados, erros });
}

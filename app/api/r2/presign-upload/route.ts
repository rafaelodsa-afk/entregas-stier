import { NextRequest, NextResponse } from "next/server";
import { gerarUrlUpload, TIPOS_PERMITIDOS } from "@/lib/r2";

const PASTAS_VALIDAS = ["canhotos", "comprovantes-pagamento"];

// Autorização de quem pode subir arquivo já é feita pelo middleware (rota
// protegida por login) — aqui só valida o tipo de arquivo e monta a chave.
export async function POST(req: NextRequest) {
  let body: { pasta?: string; pedidoId?: string; nomeArquivo?: string; tipoConteudo?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "Requisição inválida" }, { status: 400 });
  }

  const pasta = String(body.pasta ?? "");
  const pedidoId = String(body.pedidoId ?? "").trim();
  const nomeArquivo = String(body.nomeArquivo ?? "arquivo").replace(/[^a-zA-Z0-9._-]/g, "_");
  const tipoConteudo = String(body.tipoConteudo ?? "");

  if (!PASTAS_VALIDAS.includes(pasta)) {
    return NextResponse.json({ erro: "Pasta inválida" }, { status: 400 });
  }
  if (!pedidoId) {
    return NextResponse.json({ erro: "Informe o nº do pedido" }, { status: 400 });
  }
  if (!TIPOS_PERMITIDOS.includes(tipoConteudo)) {
    return NextResponse.json({ erro: "Tipo de arquivo não permitido" }, { status: 400 });
  }

  const chave = `${pasta}/pedido-${pedidoId}-${Date.now()}-${nomeArquivo}`;
  const url = await gerarUrlUpload(chave, tipoConteudo);

  return NextResponse.json({ url, key: chave });
}

import { NextRequest, NextResponse } from "next/server";
import { podeVerTudo } from "@/lib/auth";
import { processarImportacao, type LinhaImportada } from "@/lib/pedidos";

// A planilha é lida no navegador (biblioteca xlsx do lado do cliente) — aqui
// só chega o JSON já extraído, bem mais leve que o arquivo original (que
// podia passar de 5MB e estourar o limite de tamanho de requisição da
// função serverless da Vercel).
export async function POST(req: NextRequest) {
  const papel = (req.headers.get("x-user-papel") ?? "TRANSPORTADOR") as
    | "MASTER"
    | "ADMIN"
    | "ANALISTA"
    | "TRANSPORTADOR";
  if (!podeVerTudo(papel)) {
    return NextResponse.json({ erro: "Sem permissão para importar pedidos" }, { status: 403 });
  }

  let body: { linhas?: LinhaImportada[]; confirmar?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "Requisição inválida" }, { status: 400 });
  }

  const linhas = Array.isArray(body.linhas) ? body.linhas : [];
  if (linhas.length === 0) {
    return NextResponse.json({ erro: "A planilha está vazia ou não pôde ser lida" }, { status: 400 });
  }
  if (linhas.length > 5000) {
    return NextResponse.json({ erro: "Envie no máximo 5000 linhas por vez" }, { status: 400 });
  }

  const nomeUsuario = req.headers.get("x-user-nome") ?? "sistema";
  const resultados = await processarImportacao(linhas, nomeUsuario, Boolean(body.confirmar));

  const novos = resultados.filter((r) => r.classificacao === "novo").length;
  const reatribuidos = resultados.filter((r) => r.classificacao === "reatribuido").length;
  const ignorados = resultados
    .filter((r) => r.classificacao === "ignorado")
    .map((r) => ({ linha: r.linha, id: r.id, motivo: r.motivo }));

  return NextResponse.json({ novos, reatribuidos, ignorados });
}

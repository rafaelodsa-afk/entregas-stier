import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { podeVerTudo, type Papel } from "@/lib/auth";
import { gerarUrlVisualizacao } from "@/lib/r2";
import { podeAcessarPedidoDoTransportador } from "@/lib/transportador";

// A regra de "este pedido é visível pra essa sessão" é a mesma do resto do
// sistema e mora em lib/transportador.ts.

// Gera a URL assinada do canhoto/comprovante NA HORA do clique e manda o
// navegador direto pra ela.
//
// Antes cada tela assinava, de uma vez, o arquivo de todos os pedidos que ia
// listar — na tela de Pedidos isso era mais de 2 mil assinaturas por
// abertura (~1,7s de processamento e ~1 MB de texto), sendo que a pessoa abre
// no máximo um ou dois arquivos. Agora a listagem só manda este endereço
// curto, e a assinatura acontece apenas pra quem realmente clicar.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const papel = (req.headers.get("x-user-papel") ?? "TRANSPORTADOR") as Papel;
  const transportadorSessao = decodeURIComponent(req.headers.get("x-user-transportador") ?? "");

  const tipo = req.nextUrl.searchParams.get("tipo");
  if (tipo !== "canhoto" && tipo !== "comprovante") {
    return NextResponse.json({ erro: "Tipo de arquivo inválido" }, { status: 400 });
  }

  const pedido = await prisma.pedido.findUnique({
    where: { id: params.id },
    select: { transportador: true, canhotoUrl: true, comprovantePagamentoUrl: true },
  });
  if (!pedido) {
    return NextResponse.json({ erro: "Pedido não encontrado" }, { status: 404 });
  }

  // Transportador só abre arquivo dos próprios pedidos — mesma regra do PATCH.
  if (!podeVerTudo(papel) && !podeAcessarPedidoDoTransportador(pedido.transportador, transportadorSessao)) {
    return NextResponse.json({ erro: "Sem permissão sobre este pedido" }, { status: 403 });
  }

  const chave = tipo === "canhoto" ? pedido.canhotoUrl : pedido.comprovantePagamentoUrl;
  if (!chave) {
    return NextResponse.json({ erro: "Arquivo não encontrado" }, { status: 404 });
  }

  const url = await gerarUrlVisualizacao(chave);
  // no-store: a URL assinada expira: o navegador nunca deve guardar este
  // redirecionamento e reusar um link já vencido depois.
  return NextResponse.redirect(url, { headers: { "Cache-Control": "no-store" } });
}

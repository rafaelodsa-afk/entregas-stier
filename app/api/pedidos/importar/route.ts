import { NextRequest, NextResponse } from "next/server";
import { podeVerTudo } from "@/lib/auth";
import { processarImportacao, apareceNaListaDetalhada, type LinhaImportada } from "@/lib/pedidos";

// A planilha é lida no navegador (biblioteca xlsx do lado do cliente) — aqui
// só chega o JSON já extraído, bem mais leve que o arquivo original.
//
// O limite real que importa aqui NÃO é o tamanho da requisição (7000 linhas
// dá uns 2,4MB, bem abaixo do limite de corpo da função serverless) — é o
// TEMPO DE EXECUÇÃO: cada linha faz de 1 a 3 idas ao banco (Neon), uma de
// cada vez. Medido direto contra o banco de produção: ~26ms/linha só pra
// pré-visualizar (leitura) e ~56ms/linha pra confirmar de verdade (leitura +
// gravação). Em 7000 linhas isso passa de 3 a 6 minutos — muito acima do
// limite de execução de uma função serverless da Vercel (padrão 10s, até
// 60s no plano Hobby mesmo configurando maxDuration).
//
// Por isso o app/ImportarPlanilha.tsx agora manda a planilha em LOTES
// (~500 linhas cada, nunca separando linhas do mesmo nº de pedido entre dois
// lotes) — cada requisição processa só um lote, dentro do tempo permitido.
// O limite aqui embaixo é só uma rede de segurança contra um lote grande
// demais (nunca deveria disparar em uso normal).
export const maxDuration = 60;

const LIMITE_LINHAS_POR_LOTE = 2000;

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
  if (linhas.length > LIMITE_LINHAS_POR_LOTE) {
    return NextResponse.json(
      { erro: `Envie no máximo ${LIMITE_LINHAS_POR_LOTE} linhas por lote` },
      { status: 400 }
    );
  }

  const nomeUsuario = decodeURIComponent(req.headers.get("x-user-nome") ?? "sistema");
  const resultados = await processarImportacao(linhas, nomeUsuario, Boolean(body.confirmar));

  const contar = (classificacao: string) => resultados.filter((r) => r.classificacao === classificacao).length;
  // Lista detalhada (linha a linha) omite tipos de motivo marcados como
  // esperado/protegido — mas o total continua contando todo mundo,
  // suprimido ou não.
  const ignorados = resultados
    .filter((r) => r.classificacao === "ignorado" && apareceNaListaDetalhada(r))
    .map((r) => ({ linha: r.linha, id: r.id, motivo: (r as any).motivo as string }));
  const protegidos = resultados
    .filter((r) => r.classificacao === "protegido" && apareceNaListaDetalhada(r))
    .map((r) => ({ linha: r.linha, id: r.id, motivo: (r as any).motivo as string }));

  return NextResponse.json({
    novos: contar("novo"),
    novosAguardandoCanhoto: contar("novo_aguardando_canhoto"),
    novosCancelados: contar("novo_cancelado"),
    novosReentrega: contar("novo_reentrega"),
    reatribuidos: contar("reatribuido"),
    reentregaPlanilha: contar("reentrega_planilha"),
    canceladosPlanilha: contar("cancelado_planilha"),
    aguardandoCanhoto: contar("aguardando_canhoto"),
    protegidos,
    protegidosTotal: contar("protegido"),
    semMudancaOperacional: contar("sem_mudanca_operacional"),
    ignorados,
    ignoradosTotal: contar("ignorado"),
  });
}

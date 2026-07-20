import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { podeVerTudo } from "@/lib/auth";
import { gerarZipDoMes } from "@/lib/exportarMes";

const REGEX_MES = /^\d{4}-\d{2}$/;

export async function POST(req: NextRequest) {
  const papel = (req.headers.get("x-user-papel") ?? "TRANSPORTADOR") as
    | "MASTER"
    | "ADMIN"
    | "ANALISTA"
    | "TRANSPORTADOR";
  if (!podeVerTudo(papel)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  let body: { mes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "Requisição inválida" }, { status: 400 });
  }

  const mes = String(body.mes ?? "").trim();
  if (!REGEX_MES.test(mes)) {
    return NextResponse.json({ erro: "Informe o mês no formato AAAA-MM" }, { status: 400 });
  }

  const nomeUsuario = decodeURIComponent(req.headers.get("x-user-nome") ?? "sistema");
  const { buffer, totalPedidos, totalArquivos } = await gerarZipDoMes(mes, nomeUsuario);

  if (totalPedidos === 0) {
    return NextResponse.json({ erro: `Nenhum pedido encontrado para ${mes}` }, { status: 404 });
  }

  await prisma.exportacaoMensal.upsert({
    where: { mes },
    create: { mes, exportadoPor: nomeUsuario, totalPedidos, totalArquivos },
    update: { exportadoPor: nomeUsuario, exportadoEm: new Date(), totalPedidos, totalArquivos },
  });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="stier-pedidos-${mes}.zip"`,
    },
  });
}

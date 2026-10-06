import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";

// Gerador das planilhas do sistema. A ideia é entregar algo que pareça um
// relatório da Stier, não uma exportação crua: capa com o logo e os números
// principais, abas com a identidade do sistema, e todo total em FÓRMULA.
//
// Convenções de formatação seguidas aqui (padrão de planilha profissional):
//  - Arial em tudo, pra abrir igual em qualquer máquina;
//  - valor zerado aparece como "-" e negativo entre parênteses;
//  - porcentagem guardada como fração (0,15 mostra 15,0%);
//  - data e dinheiro gravados como data e número de verdade, nunca texto,
//    pra continuarem somáveis e ordenáveis de quem recebe;
//  - nada de número cravado onde cabe fórmula.
//
// Por que exceljs e não o xlsx que o projeto usa na importação: a versão
// community do SheetJS descarta estilo na gravação (testado — o índice de
// estilo não sai no arquivo), então cor e negrito não chegariam no arquivo.

// ---------- identidade visual (mesmos tons das telas) ----------
const NAVY = "FF1F3348"; // faixa de cabeçalho / fundo da capa
const NAVY_CLARO = "FF2C4760";
const AMBAR = "FFE3A73E"; // destaque da marca
const AMBAR_SUAVE = "FFFBF0DC";
const BRANCO = "FFFFFFFF";
const TEXTO = "FF1B2733";
const TEXTO_SUAVE = "FF5A6672";
const ZEBRA = "FFF7F9FB";
const BORDA = "FFDDE3E9";

export const FONTE = "Arial";

// Cor de fundo + cor de texto de cada status, pro badge ficar legível.
const ESTILO_STATUS: Record<string, { fundo: string; texto: string }> = {
  AGUARDANDO_ACEITE: { fundo: "FFFCEFCE", texto: "FF8A6204" },
  AGUARDANDO_CARREGAMENTO: { fundo: "FFFBE2CC", texto: "FF8F4A09" },
  EM_ROTA: { fundo: "FFD7E6F9", texto: "FF1A4E8F" },
  AGUARDANDO_CANHOTO: { fundo: "FFFBD5E6", texto: "FF8F1D53" },
  ENTREGUE: { fundo: "FFD2F1E2", texto: "FF136B4A" },
  ENTREGUE_SEM_COMPROVANTE: { fundo: "FFFBE2CC", texto: "FF8F4A09" },
  REENTREGA: { fundo: "FFE7DEFC", texto: "FF4B2E9C" },
  CANCELADO: { fundo: "FFF9D6D1", texto: "FF8F2317" },
  DEVOLVIDO: { fundo: "FFE5E8EB", texto: "FF4A535C" },
};

// Zero vira "-" e negativo entra entre parênteses.
export const FORMATO_MOEDA = 'R$ #,##0.00;(R$ #,##0.00);"-"';
export const FORMATO_INTEIRO = '#,##0;(#,##0);"-"';
export const FORMATO_DATA = "dd/mm/yyyy";
export const FORMATO_PCT = "0.0%";

const LINHA_CABECALHO = 6; // capa das abas ocupa as 5 primeiras linhas
const PRIMEIRA_LINHA_DADOS = LINHA_CABECALHO + 1;

export { PRIMEIRA_LINHA_DADOS };

// ---------- logo ----------
// Lido do disco uma única vez. O arquivo é claro (o site inverte no tema
// claro), então ele vai sempre sobre a faixa escura — fica legível sem
// precisar de outra versão da imagem.
let logoCache: Buffer | null | undefined;
function lerLogo(): Buffer | null {
  if (logoCache !== undefined) return logoCache;
  try {
    logoCache = fs.readFileSync(path.join(process.cwd(), "public", "logo-stier.png"));
  } catch {
    // Sem logo a planilha sai igual, só sem a imagem — nunca derruba o relatório.
    logoCache = null;
  }
  return logoCache;
}

function idDoLogo(wb: ExcelJS.Workbook): number | null {
  const buffer = lerLogo();
  if (!buffer) return null;
  const comCache = wb as ExcelJS.Workbook & { __idLogo?: number };
  if (comCache.__idLogo === undefined) {
    comCache.__idLogo = wb.addImage({ buffer: buffer as any, extension: "png" });
  }
  return comCache.__idLogo;
}

// ---------- helpers ----------
export type TipoColuna = "texto" | "moeda" | "data" | "numero" | "status" | "sim_nao";

export type Coluna<T> = {
  titulo: string;
  largura?: number;
  tipo?: TipoColuna;
  valor: (item: T) => string | number | Date | null;
  /** Entra na linha de TOTAL (em fórmula SUBTOTAL). */
  somar?: boolean;
  /** Para colunas "status": devolve a chave do status, usada só pra pintar. */
  chaveStatus?: (item: T) => string;
};

function borda(celula: ExcelJS.Cell, cor = BORDA) {
  celula.border = {
    top: { style: "thin", color: { argb: cor } },
    left: { style: "thin", color: { argb: cor } },
    bottom: { style: "thin", color: { argb: cor } },
    right: { style: "thin", color: { argb: cor } },
  };
}

function preencher(celula: ExcelJS.Cell, cor: string) {
  celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: cor } };
}

// Barra proporcional dentro da célula (dá a leitura de peso de cada linha sem
// precisar de gráfico). O "cfvo" com min/max é obrigatório — sem ele o
// exceljs quebra na hora de gravar o arquivo.
function regraBarra(): ExcelJS.ConditionalFormattingRule {
  return {
    type: "dataBar",
    priority: 1,
    cfvo: [{ type: "min" }, { type: "max" }],
    color: { argb: AMBAR },
    gradient: true,
    showValue: true,
  } as unknown as ExcelJS.ConditionalFormattingRule;
}

/** Faixa de marca no topo de uma aba de dados: logo + título + subtítulo. */
function faixaDeMarca(aba: ExcelJS.Worksheet, wb: ExcelJS.Workbook, titulo: string, subtitulo: string, colunas: number) {
  // Linhas 1-4 formam a faixa escura; a 5 fica vazia pra respirar.
  for (let linha = 1; linha <= 4; linha++) {
    for (let col = 1; col <= colunas; col++) {
      preencher(aba.getCell(linha, col), NAVY);
    }
  }
  aba.getRow(1).height = 10;
  aba.getRow(2).height = 26;
  aba.getRow(3).height = 18;
  aba.getRow(4).height = 10;
  aba.getRow(5).height = 8;

  const temLogo = idDoLogo(wb) !== null;
  // Texto começa depois do espaço do logo quando ele existe.
  const colTexto = temLogo ? 3 : 1;

  aba.mergeCells(2, colTexto, 2, Math.max(colTexto, colunas));
  const cTitulo = aba.getCell(2, colTexto);
  cTitulo.value = titulo;
  cTitulo.font = { name: FONTE, bold: true, size: 16, color: { argb: BRANCO } };
  cTitulo.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  aba.mergeCells(3, colTexto, 3, Math.max(colTexto, colunas));
  const cSub = aba.getCell(3, colTexto);
  cSub.value = subtitulo;
  cSub.font = { name: FONTE, size: 9.5, color: { argb: "FFB9C6D4" } };
  cSub.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  const id = idDoLogo(wb);
  if (id !== null) {
    // Logo ancorado na faixa escura (o arquivo é claro, então contrasta).
    aba.addImage(id, {
      tl: { col: 0.3, row: 1.15 },
      ext: { width: 132, height: 30 },
      editAs: "oneCell",
    });
  }
}

/**
 * Monta uma aba de dados formatada. Devolve onde ficaram os dados, pra quem
 * chamar poder apontar fórmulas de resumo para cá.
 */
export function adicionarAba<T>(
  wb: ExcelJS.Workbook,
  opcoes: {
    nome: string;
    titulo: string;
    subtitulo?: string;
    colunas: Coluna<T>[];
    itens: T[];
    corAba?: string;
  }
): { aba: ExcelJS.Worksheet; primeiraLinha: number; ultimaLinha: number } {
  const { nome, titulo, subtitulo, colunas, itens } = opcoes;
  // O Excel recusa : \ / ? * [ ] no nome da aba e corta em 31 caracteres.
  const nomeSeguro = nome.replace(/[:\\/?*[\]]/g, "-").slice(0, 31);
  const aba = wb.addWorksheet(nomeSeguro, {
    views: [{ state: "frozen", ySplit: LINHA_CABECALHO, showGridLines: false }],
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
      printTitlesRow: `${LINHA_CABECALHO}:${LINHA_CABECALHO}`,
    },
  });
  aba.properties.tabColor = { argb: opcoes.corAba ?? NAVY };
  // Rodapé de impressão: identifica o relatório e numera as páginas.
  aba.headerFooter.oddFooter = `&L&"${FONTE}"&8Stier · Controle de Entregas&C&"${FONTE}"&8${titulo}&R&"${FONTE}"&8Página &P de &N`;

  aba.columns = colunas.map((c) => ({
    width: c.largura ?? 18,
    style: { font: { name: FONTE, size: 10, color: { argb: TEXTO } } },
  }));

  faixaDeMarca(
    aba,
    wb,
    titulo,
    subtitulo ?? `${itens.length.toLocaleString("pt-BR")} registro(s) · gerado em ${new Date().toLocaleString("pt-BR")}`,
    colunas.length
  );

  // Cabeçalho da tabela
  const linhaCab = aba.getRow(LINHA_CABECALHO);
  colunas.forEach((c, i) => {
    const celula = linhaCab.getCell(i + 1);
    celula.value = c.titulo;
    celula.font = { name: FONTE, bold: true, size: 10, color: { argb: BRANCO } };
    preencher(celula, NAVY_CLARO);
    celula.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    borda(celula, NAVY_CLARO);
  });
  linhaCab.height = 30;

  // Dados
  itens.forEach((item, indice) => {
    const linha = aba.getRow(PRIMEIRA_LINHA_DADOS + indice);
    linha.height = 17;
    colunas.forEach((c, i) => {
      const celula = linha.getCell(i + 1);
      celula.value = c.valor(item) as ExcelJS.CellValue;
      celula.font = { name: FONTE, size: 10, color: { argb: TEXTO } };

      if (c.tipo === "moeda") {
        celula.numFmt = FORMATO_MOEDA;
        celula.alignment = { horizontal: "right", vertical: "middle" };
      } else if (c.tipo === "data") {
        celula.numFmt = FORMATO_DATA;
        celula.alignment = { horizontal: "center", vertical: "middle" };
      } else if (c.tipo === "numero") {
        celula.numFmt = FORMATO_INTEIRO;
        celula.alignment = { horizontal: "center", vertical: "middle" };
      } else if (c.tipo === "status") {
        const chave = c.chaveStatus ? c.chaveStatus(item) : String(celula.value ?? "");
        const estilo = ESTILO_STATUS[chave];
        if (estilo) {
          preencher(celula, estilo.fundo);
          celula.font = { name: FONTE, size: 9.5, bold: true, color: { argb: estilo.texto } };
        }
        celula.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      } else if (c.tipo === "sim_nao") {
        const sim = String(celula.value).toLowerCase() === "sim";
        celula.font = { name: FONTE, size: 10, bold: true, color: { argb: sim ? "FF136B4A" : "FF8F2317" } };
        celula.alignment = { horizontal: "center", vertical: "middle" };
      } else {
        celula.alignment = { horizontal: "left", vertical: "middle" };
      }

      // Zebra onde a célula não tem cor própria.
      if (indice % 2 === 1 && c.tipo !== "status") preencher(celula, ZEBRA);
      borda(celula);
    });
  });

  const ultimaLinha = itens.length > 0 ? LINHA_CABECALHO + itens.length : LINHA_CABECALHO;

  if (itens.length > 0) {
    aba.autoFilter = {
      from: { row: LINHA_CABECALHO, column: 1 },
      to: { row: ultimaLinha, column: colunas.length },
    };

    // Barra proporcional na coluna de valor: dá a leitura visual de peso de
    // cada linha sem precisar abrir gráfico.
    const indiceValor = colunas.findIndex((c) => c.tipo === "moeda" && c.somar);
    if (indiceValor >= 0) {
      const letra = aba.getColumn(indiceValor + 1).letter;
      aba.addConditionalFormatting({
        ref: `${letra}${PRIMEIRA_LINHA_DADOS}:${letra}${ultimaLinha}`,
        rules: [regraBarra()],
      });
    }
  }

  // Linha de TOTAL em fórmula. SUBTOTAL(109) ignora o que o filtro esconder,
  // então filtrar um transportador já mostra o total dele.
  if (itens.length > 0 && colunas.some((c) => c.somar)) {
    const linhaTotal = aba.getRow(ultimaLinha + 1);
    linhaTotal.height = 24;
    colunas.forEach((c, i) => {
      const celula = linhaTotal.getCell(i + 1);
      if (i === 0) {
        celula.value = "TOTAL";
      } else if (c.somar) {
        const letra = aba.getColumn(i + 1).letter;
        celula.value = { formula: `SUBTOTAL(109,${letra}${PRIMEIRA_LINHA_DADOS}:${letra}${ultimaLinha})` };
        celula.numFmt = c.tipo === "moeda" ? FORMATO_MOEDA : FORMATO_INTEIRO;
      }
      celula.font = { name: FONTE, bold: true, size: 10.5, color: { argb: TEXTO } };
      preencher(celula, AMBAR);
      celula.alignment = { horizontal: c.somar ? "right" : "left", vertical: "middle", indent: c.somar ? 0 : 1 };
      borda(celula, AMBAR);
    });
    // Nota explicando que o total acompanha o filtro.
    const nota = aba.getRow(ultimaLinha + 2).getCell(1);
    nota.value = "O TOTAL acima acompanha o filtro do cabeçalho — filtre um transportador e ele recalcula sozinho.";
    nota.font = { name: FONTE, italic: true, size: 9, color: { argb: TEXTO_SUAVE } };
  }

  return { aba, primeiraLinha: PRIMEIRA_LINHA_DADOS, ultimaLinha };
}

/** Aba de resumo por transportador, toda em fórmula ligada à aba de detalhe. */
export function adicionarAbaResumoPorTransportador(
  wb: ExcelJS.Workbook,
  opcoes: {
    nomeAbaDetalhe: string;
    transportadores: string[];
    colunaTransportador: string;
    colunaValor: string;
    primeiraLinhaDados: number;
    ultimaLinhaDados: number;
  }
): ExcelJS.Worksheet {
  const { nomeAbaDetalhe, transportadores, colunaTransportador, colunaValor, primeiraLinhaDados, ultimaLinhaDados } =
    opcoes;

  const aba = wb.addWorksheet("Resumo por transportador", {
    views: [{ state: "frozen", ySplit: LINHA_CABECALHO, showGridLines: false }],
    pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  aba.properties.tabColor = { argb: AMBAR };
  aba.columns = [
    { width: 40, style: { font: { name: FONTE, size: 10, color: { argb: TEXTO } } } },
    { width: 14, style: { font: { name: FONTE, size: 10, color: { argb: TEXTO } } } },
    { width: 20, style: { font: { name: FONTE, size: 10, color: { argb: TEXTO } } } },
    { width: 14, style: { font: { name: FONTE, size: 10, color: { argb: TEXTO } } } },
  ];

  faixaDeMarca(
    aba,
    wb,
    "Resumo por transportador",
    `Números em fórmula ligada à aba "${nomeAbaDetalhe}" — corrigindo lá, atualiza aqui`,
    4
  );

  const cabecalhos = ["Transportador", "Pedidos", "Valor total", "% do valor"];
  const linhaCab = aba.getRow(LINHA_CABECALHO);
  cabecalhos.forEach((t, i) => {
    const celula = linhaCab.getCell(i + 1);
    celula.value = t;
    celula.font = { name: FONTE, bold: true, size: 10, color: { argb: BRANCO } };
    preencher(celula, NAVY_CLARO);
    celula.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    borda(celula, NAVY_CLARO);
  });
  linhaCab.height = 30;

  const faixaTransp = `'${nomeAbaDetalhe}'!$${colunaTransportador}$${primeiraLinhaDados}:$${colunaTransportador}$${ultimaLinhaDados}`;
  const faixaValor = `'${nomeAbaDetalhe}'!$${colunaValor}$${primeiraLinhaDados}:$${colunaValor}$${ultimaLinhaDados}`;

  transportadores.forEach((t, indice) => {
    const n = PRIMEIRA_LINHA_DADOS + indice;
    const linha = aba.getRow(n);
    linha.height = 18;
    linha.getCell(1).value = t;
    linha.getCell(2).value = { formula: `COUNTIF(${faixaTransp},A${n})` };
    linha.getCell(2).numFmt = FORMATO_INTEIRO;
    linha.getCell(3).value = { formula: `SUMIF(${faixaTransp},A${n},${faixaValor})` };
    linha.getCell(3).numFmt = FORMATO_MOEDA;
    linha.getCell(4).value = { formula: `IFERROR(C${n}/SUM(${faixaValor}),0)` };
    linha.getCell(4).numFmt = FORMATO_PCT;
    for (let c = 1; c <= 4; c++) {
      const celula = linha.getCell(c);
      celula.font = { name: FONTE, size: 10, color: { argb: TEXTO } };
      if (indice % 2 === 1) preencher(celula, ZEBRA);
      celula.alignment = {
        horizontal: c === 1 ? "left" : c === 2 || c === 4 ? "center" : "right",
        vertical: "middle",
      };
      borda(celula);
    }
  });

  const ultima = PRIMEIRA_LINHA_DADOS + transportadores.length - 1;

  // Barra proporcional no valor — o ranking fica óbvio de bater o olho.
  if (transportadores.length > 0) {
    aba.addConditionalFormatting({
      ref: `C${PRIMEIRA_LINHA_DADOS}:C${ultima}`,
      rules: [regraBarra()],
    });
  }

  const nTotal = ultima + 1;
  const linhaTotal = aba.getRow(nTotal);
  linhaTotal.height = 24;
  linhaTotal.getCell(1).value = "TOTAL";
  linhaTotal.getCell(2).value = { formula: `SUM(B${PRIMEIRA_LINHA_DADOS}:B${ultima})` };
  linhaTotal.getCell(2).numFmt = FORMATO_INTEIRO;
  linhaTotal.getCell(3).value = { formula: `SUM(C${PRIMEIRA_LINHA_DADOS}:C${ultima})` };
  linhaTotal.getCell(3).numFmt = FORMATO_MOEDA;
  linhaTotal.getCell(4).value = { formula: `SUM(D${PRIMEIRA_LINHA_DADOS}:D${ultima})` };
  linhaTotal.getCell(4).numFmt = FORMATO_PCT;
  for (let c = 1; c <= 4; c++) {
    const celula = linhaTotal.getCell(c);
    celula.font = { name: FONTE, bold: true, size: 10.5, color: { argb: TEXTO } };
    preencher(celula, AMBAR);
    celula.alignment = { horizontal: c === 1 ? "left" : c === 3 ? "right" : "center", vertical: "middle", indent: c === 1 ? 1 : 0 };
    borda(celula, AMBAR);
  }

  return aba;
}

/** Aba simples de "rótulo + quantidade (+ valor)". */
export function adicionarAbaContagem(
  wb: ExcelJS.Workbook,
  opcoes: {
    nome: string;
    titulo: string;
    rotuloColuna: string;
    linhas: { rotulo: string; quantidade: number; valor?: number; chaveStatus?: string }[];
  }
) {
  const { nome, titulo, rotuloColuna, linhas } = opcoes;
  const temValor = linhas.some((l) => l.valor !== undefined);
  type L = { rotulo: string; quantidade: number; valor?: number; chaveStatus?: string };
  const colunas: Coluna<L>[] = [
    {
      titulo: rotuloColuna,
      largura: 44,
      tipo: linhas.some((l) => l.chaveStatus) ? "status" : "texto",
      valor: (l) => l.rotulo,
      chaveStatus: (l) => l.chaveStatus ?? "",
    },
    { titulo: "Pedidos", largura: 14, tipo: "numero", valor: (l) => l.quantidade, somar: true },
  ];
  if (temValor) {
    colunas.push({ titulo: "Valor total", largura: 22, tipo: "moeda", valor: (l) => l.valor ?? 0, somar: true });
  }
  return adicionarAba(wb, { nome, titulo, colunas, itens: linhas, corAba: AMBAR });
}

// ---------- capa ----------
export type CartaoCapa = { rotulo: string; valor: string | number; formato?: string; destaque?: boolean };

/**
 * Capa do relatório: logo da Stier sobre fundo escuro, nome do relatório,
 * quem gerou e quando, os números principais em destaque e a legenda de
 * cores. É a primeira coisa que a pessoa vê ao abrir o arquivo.
 */
export function adicionarCapa(
  wb: ExcelJS.Workbook,
  opcoes: {
    titulo: string;
    subtitulo: string;
    geradoPor: string;
    cartoes: CartaoCapa[];
    abas: { nome: string; descricao: string }[];
    mostrarLegendaStatus?: boolean;
  }
): ExcelJS.Worksheet {
  const { titulo, subtitulo, geradoPor, cartoes, abas } = opcoes;
  const COLS = 8;
  const aba = wb.addWorksheet("Capa", {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  aba.properties.tabColor = { argb: AMBAR };
  aba.columns = Array.from({ length: COLS }, () => ({
    width: 16,
    style: { font: { name: FONTE, size: 10, color: { argb: TEXTO } } },
  }));

  // Bloco escuro do topo (linhas 1 a 8) com o logo centralizado.
  for (let l = 1; l <= 8; l++) {
    for (let c = 1; c <= COLS; c++) preencher(aba.getCell(l, c), NAVY);
    aba.getRow(l).height = l === 4 ? 34 : l === 5 ? 22 : 16;
  }

  const id = idDoLogo(wb);
  if (id !== null) {
    aba.addImage(id, { tl: { col: 0.45, row: 1.1 }, ext: { width: 210, height: 48 }, editAs: "oneCell" });
  }

  aba.mergeCells(4, 1, 4, COLS);
  const cTitulo = aba.getCell(4, 1);
  cTitulo.value = titulo;
  cTitulo.font = { name: FONTE, bold: true, size: 22, color: { argb: BRANCO } };
  cTitulo.alignment = { vertical: "middle", horizontal: "center" };

  aba.mergeCells(5, 1, 5, COLS);
  const cSub = aba.getCell(5, 1);
  cSub.value = subtitulo;
  cSub.font = { name: FONTE, size: 11, color: { argb: AMBAR } };
  cSub.alignment = { vertical: "middle", horizontal: "center" };

  aba.mergeCells(6, 1, 6, COLS);
  const cGer = aba.getCell(6, 1);
  cGer.value = `Gerado por ${geradoPor} · ${new Date().toLocaleString("pt-BR")}`;
  cGer.font = { name: FONTE, size: 9.5, color: { argb: "FFB9C6D4" } };
  cGer.alignment = { vertical: "middle", horizontal: "center" };

  // ---- cartões com os números principais ----
  let linha = 10;
  aba.getCell(linha, 1).value = "NÚMEROS DESTE RELATÓRIO";
  aba.getCell(linha, 1).font = { name: FONTE, bold: true, size: 10, color: { argb: TEXTO_SUAVE } };
  linha += 1;

  // Dois cartões por fileira, cada um com 4 colunas de largura.
  cartoes.forEach((cartao, i) => {
    const col = i % 2 === 0 ? 1 : 5;
    const linhaCartao = linha + Math.floor(i / 2) * 3;

    aba.mergeCells(linhaCartao, col, linhaCartao, col + 3);
    const cRotulo = aba.getCell(linhaCartao, col);
    cRotulo.value = cartao.rotulo.toUpperCase();
    cRotulo.font = { name: FONTE, bold: true, size: 9, color: { argb: TEXTO_SUAVE } };
    cRotulo.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    preencher(cRotulo, cartao.destaque ? AMBAR_SUAVE : ZEBRA);

    aba.mergeCells(linhaCartao + 1, col, linhaCartao + 1, col + 3);
    const cValor = aba.getCell(linhaCartao + 1, col);
    cValor.value = cartao.valor as ExcelJS.CellValue;
    if (cartao.formato) cValor.numFmt = cartao.formato;
    cValor.font = { name: FONTE, bold: true, size: 18, color: { argb: cartao.destaque ? "FF8A6204" : NAVY } };
    cValor.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    preencher(cValor, cartao.destaque ? AMBAR_SUAVE : ZEBRA);
    aba.getRow(linhaCartao).height = 16;
    aba.getRow(linhaCartao + 1).height = 30;

    for (let c = col; c <= col + 3; c++) {
      borda(aba.getCell(linhaCartao, c), cartao.destaque ? AMBAR : BORDA);
      borda(aba.getCell(linhaCartao + 1, c), cartao.destaque ? AMBAR : BORDA);
    }
  });

  linha = linha + Math.ceil(cartoes.length / 2) * 3 + 1;

  // ---- o que tem em cada aba ----
  aba.getCell(linha, 1).value = "O QUE TEM EM CADA ABA";
  aba.getCell(linha, 1).font = { name: FONTE, bold: true, size: 10, color: { argb: TEXTO_SUAVE } };
  linha += 1;
  abas.forEach((a) => {
    const cNome = aba.getCell(linha, 1);
    cNome.value = a.nome;
    cNome.font = { name: FONTE, bold: true, size: 10, color: { argb: NAVY } };
    cNome.alignment = { vertical: "middle", indent: 1 };
    aba.mergeCells(linha, 2, linha, COLS);
    const cDesc = aba.getCell(linha, 2);
    cDesc.value = a.descricao;
    cDesc.font = { name: FONTE, size: 9.5, color: { argb: TEXTO } };
    cDesc.alignment = { vertical: "middle" };
    aba.getRow(linha).height = 16;
    linha += 1;
  });

  // ---- legenda de cores ----
  if (opcoes.mostrarLegendaStatus) {
    linha += 1;
    aba.getCell(linha, 1).value = "LEGENDA DE CORES (STATUS DE ENTREGA)";
    aba.getCell(linha, 1).font = { name: FONTE, bold: true, size: 10, color: { argb: TEXTO_SUAVE } };
    linha += 1;
    const legendas: [string, string][] = [
      ["AGUARDANDO_ACEITE", "Aguardando aceite"],
      ["AGUARDANDO_CARREGAMENTO", "Aguardando carregamento"],
      ["EM_ROTA", "Em rota de entrega"],
      ["AGUARDANDO_CANHOTO", "Entregue (planilha) — aguardando canhoto"],
      ["ENTREGUE", "Entregue"],
      ["ENTREGUE_SEM_COMPROVANTE", "Entregue (sem comprovante)"],
      ["REENTREGA", "Reentrega"],
      ["CANCELADO", "Cancelado"],
      ["DEVOLVIDO", "Devolvido"],
    ];
    legendas.forEach(([chave, rotulo], i) => {
      const l = linha + Math.floor(i / 2);
      const col = i % 2 === 0 ? 1 : 5;
      aba.mergeCells(l, col, l, col + 3);
      const celula = aba.getCell(l, col);
      celula.value = rotulo;
      const estilo = ESTILO_STATUS[chave];
      if (estilo) {
        preencher(celula, estilo.fundo);
        celula.font = { name: FONTE, bold: true, size: 9.5, color: { argb: estilo.texto } };
      }
      celula.alignment = { vertical: "middle", horizontal: "center" };
      for (let c = col; c <= col + 3; c++) borda(aba.getCell(l, c));
      aba.getRow(l).height = 17;
    });
    linha += Math.ceil(legendas.length / 2) + 1;
  }

  // ---- nota de rodapé ----
  linha += 1;
  aba.mergeCells(linha, 1, linha, COLS);
  const rodape = aba.getCell(linha, 1);
  rodape.value =
    "Os totais destas abas são fórmulas, não números fixos: ao filtrar o cabeçalho de uma aba, o total se ajusta sozinho. A aba de resumo soma a partir da aba de detalhe, então corrigir um valor no detalhe atualiza o resumo.";
  rodape.font = { name: FONTE, italic: true, size: 9, color: { argb: TEXTO_SUAVE } };
  rodape.alignment = { wrapText: true, vertical: "top" };
  aba.getRow(linha).height = 30;

  return aba;
}

export function novaPlanilha(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Stier · Controle de Entregas";
  wb.company = "Stier";
  wb.created = new Date();
  return wb;
}

export async function planilhaParaBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await wb.xlsx.writeBuffer());
}

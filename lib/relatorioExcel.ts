import ExcelJS from "exceljs";

// Gerador de planilha pronta pra usar: cabeçalho colorido e congelado,
// filtro automático, largura de coluna ajustada, valores como número/data de
// verdade (não texto), status pintado igual às telas, linhas zebradas e
// totais em FÓRMULA — nunca número cravado.
//
// A fórmula de total é SUBTOTAL(109; ...) em vez de SOMA: o 109 ignora o que
// o filtro automático esconder, então quem abrir a planilha e filtrar um
// transportador vê o total daquele transportador, sem refazer conta nenhuma.
//
// Por que exceljs e não a biblioteca xlsx que o projeto já usa na importação:
// a versão community do SheetJS descarta estilo na gravação (testado — o
// índice de estilo não sai no arquivo), então cor e negrito simplesmente não
// chegariam no arquivo final.

// Paleta: mesmos tons das telas, pra planilha e sistema parecerem a mesma coisa.
const AZUL_ESCURO = "FF1F3348";
const AMBAR = "FFE3A73E";
const BRANCO = "FFFFFFFF";
const CINZA_ZEBRA = "FFF4F6F8";
const CINZA_BORDA = "FFD6DBE1";

const COR_STATUS_PLANILHA: Record<string, string> = {
  AGUARDANDO_ACEITE: "FFFDF0D5",
  AGUARDANDO_CARREGAMENTO: "FFFDE4D0",
  EM_ROTA: "FFD9E7F8",
  AGUARDANDO_CANHOTO: "FFFBD9E8",
  ENTREGUE: "FFD5F2E6",
  REENTREGA: "FFE8E0FC",
  CANCELADO: "FFF9D9D5",
  DEVOLVIDO: "FFE6E8EB",
};

export const FORMATO_MOEDA = 'R$ #,##0.00';
export const FORMATO_DATA = "dd/mm/yyyy";

export type TipoColuna = "texto" | "moeda" | "data" | "numero" | "status";

export type Coluna<T> = {
  titulo: string;
  largura?: number;
  tipo?: TipoColuna;
  // Valor da célula. Devolver Date/number de verdade (não string) é o que
  // deixa a planilha somável e ordenável do lado de quem recebe.
  valor: (item: T) => string | number | Date | null;
  // Soma esta coluna na linha de total.
  somar?: boolean;
};

function aplicarBorda(celula: ExcelJS.Cell) {
  celula.border = {
    top: { style: "thin", color: { argb: CINZA_BORDA } },
    left: { style: "thin", color: { argb: CINZA_BORDA } },
    bottom: { style: "thin", color: { argb: CINZA_BORDA } },
    right: { style: "thin", color: { argb: CINZA_BORDA } },
  };
}

/**
 * Monta uma aba formatada. Devolve a aba pra quem chamar poder acrescentar
 * algo depois (um bloco de resumo, por exemplo).
 */
export function adicionarAba<T>(
  wb: ExcelJS.Workbook,
  opcoes: {
    nome: string;
    titulo: string;
    subtitulo?: string;
    colunas: Coluna<T>[];
    itens: T[];
  }
): ExcelJS.Worksheet {
  const { nome, titulo, subtitulo, colunas, itens } = opcoes;
  // O Excel recusa nome de aba com : \ / ? * [ ] ou acima de 31 caracteres.
  const nomeSeguro = nome.replace(/[:\\/?*[\]]/g, "-").slice(0, 31);
  const aba = wb.addWorksheet(nomeSeguro, {
    views: [{ state: "frozen", ySplit: 4 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  aba.columns = colunas.map((c) => ({ width: c.largura ?? 18 }));

  // Faixa de título
  aba.mergeCells(1, 1, 1, colunas.length);
  const celulaTitulo = aba.getCell(1, 1);
  celulaTitulo.value = titulo;
  celulaTitulo.font = { bold: true, size: 15, color: { argb: BRANCO } };
  celulaTitulo.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL_ESCURO } };
  celulaTitulo.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  aba.getRow(1).height = 30;

  // Subtítulo (contagem, período, quem gerou)
  aba.mergeCells(2, 1, 2, colunas.length);
  const celulaSub = aba.getCell(2, 1);
  celulaSub.value =
    subtitulo ??
    `${itens.length} registro(s) — gerado em ${new Date().toLocaleString("pt-BR")}`;
  celulaSub.font = { size: 10, italic: true, color: { argb: "FF5A6672" } };
  celulaSub.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  aba.getRow(2).height = 18;

  // Linha 3 fica vazia de propósito, pra respirar.

  // Cabeçalho
  const LINHA_CABECALHO = 4;
  const linhaCab = aba.getRow(LINHA_CABECALHO);
  colunas.forEach((c, i) => {
    const celula = linhaCab.getCell(i + 1);
    celula.value = c.titulo;
    celula.font = { bold: true, color: { argb: BRANCO }, size: 11 };
    celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL_ESCURO } };
    celula.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    aplicarBorda(celula);
  });
  linhaCab.height = 26;

  // Dados
  itens.forEach((item, indice) => {
    const linha = aba.getRow(LINHA_CABECALHO + 1 + indice);
    colunas.forEach((c, i) => {
      const celula = linha.getCell(i + 1);
      const valor = c.valor(item);
      celula.value = valor as ExcelJS.CellValue;

      if (c.tipo === "moeda") {
        celula.numFmt = FORMATO_MOEDA;
        celula.alignment = { horizontal: "right" };
      } else if (c.tipo === "data") {
        celula.numFmt = FORMATO_DATA;
        celula.alignment = { horizontal: "center" };
      } else if (c.tipo === "numero") {
        celula.alignment = { horizontal: "center" };
      } else if (c.tipo === "status") {
        const chave = String(valor ?? "");
        const cor = COR_STATUS_PLANILHA[chave];
        if (cor) {
          celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: cor } };
        }
        celula.alignment = { horizontal: "center" };
      } else {
        celula.alignment = { horizontal: "left", wrapText: false };
      }

      // Zebra só onde não há cor própria de status, pra não brigar com ela.
      if (indice % 2 === 1 && c.tipo !== "status") {
        celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CINZA_ZEBRA } };
      }
      aplicarBorda(celula);
    });
  });

  const primeiraLinhaDados = LINHA_CABECALHO + 1;
  const ultimaLinhaDados = LINHA_CABECALHO + itens.length;

  // Filtro automático no cabeçalho — é o que faz o SUBTOTAL abaixo reagir.
  if (itens.length > 0) {
    aba.autoFilter = {
      from: { row: LINHA_CABECALHO, column: 1 },
      to: { row: ultimaLinhaDados, column: colunas.length },
    };
  }

  // Linha de total, em fórmula
  if (itens.length > 0 && colunas.some((c) => c.somar)) {
    const linhaTotal = aba.getRow(ultimaLinhaDados + 1);
    colunas.forEach((c, i) => {
      const celula = linhaTotal.getCell(i + 1);
      if (i === 0) {
        celula.value = "TOTAL";
      } else if (c.somar) {
        const letra = aba.getColumn(i + 1).letter;
        celula.value = {
          formula: `SUBTOTAL(109,${letra}${primeiraLinhaDados}:${letra}${ultimaLinhaDados})`,
        };
        celula.numFmt = c.tipo === "moeda" ? FORMATO_MOEDA : "#,##0";
      }
      celula.font = { bold: true, size: 11 };
      celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AMBAR } };
      celula.alignment = { horizontal: c.somar ? "right" : "left" };
      aplicarBorda(celula);
    });
    linhaTotal.height = 22;
  }

  return aba;
}

/**
 * Aba de resumo por transportador. A contagem e a soma são SOMASE/CONT.SE
 * apontando pra aba de detalhe — então se a pessoa corrigir um valor lá, o
 * resumo acompanha sozinho, que é o que se espera de uma planilha "pronta".
 */
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
    views: [{ state: "frozen", ySplit: 4 }],
  });
  aba.columns = [{ width: 38 }, { width: 16 }, { width: 20 }, { width: 16 }];

  aba.mergeCells(1, 1, 1, 4);
  const titulo = aba.getCell(1, 1);
  titulo.value = "Resumo por transportador";
  titulo.font = { bold: true, size: 15, color: { argb: BRANCO } };
  titulo.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL_ESCURO } };
  titulo.alignment = { vertical: "middle", indent: 1 };
  aba.getRow(1).height = 30;

  aba.mergeCells(2, 1, 2, 4);
  const sub = aba.getCell(2, 1);
  sub.value = `Os números abaixo são fórmulas ligadas à aba "${nomeAbaDetalhe}" — corrigindo lá, atualiza aqui.`;
  sub.font = { size: 10, italic: true, color: { argb: "FF5A6672" } };
  sub.alignment = { vertical: "middle", indent: 1 };

  const cabecalhos = ["Transportador", "Pedidos", "Valor total", "% do valor"];
  const linhaCab = aba.getRow(4);
  cabecalhos.forEach((t, i) => {
    const celula = linhaCab.getCell(i + 1);
    celula.value = t;
    celula.font = { bold: true, color: { argb: BRANCO }, size: 11 };
    celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL_ESCURO } };
    celula.alignment = { horizontal: "center", vertical: "middle" };
    aplicarBorda(celula);
  });
  linhaCab.height = 26;

  const faixaTransp = `'${nomeAbaDetalhe}'!$${colunaTransportador}$${primeiraLinhaDados}:$${colunaTransportador}$${ultimaLinhaDados}`;
  const faixaValor = `'${nomeAbaDetalhe}'!$${colunaValor}$${primeiraLinhaDados}:$${colunaValor}$${ultimaLinhaDados}`;

  transportadores.forEach((t, indice) => {
    const nLinha = 5 + indice;
    const linha = aba.getRow(nLinha);
    linha.getCell(1).value = t;
    linha.getCell(2).value = { formula: `COUNTIF(${faixaTransp},A${nLinha})` };
    linha.getCell(3).value = { formula: `SUMIF(${faixaTransp},A${nLinha},${faixaValor})` };
    linha.getCell(3).numFmt = FORMATO_MOEDA;
    linha.getCell(4).value = { formula: `IF(SUM(${faixaValor})=0,0,C${nLinha}/SUM(${faixaValor}))` };
    linha.getCell(4).numFmt = "0.0%";
    for (let c = 1; c <= 4; c++) {
      const celula = linha.getCell(c);
      if (indice % 2 === 1) {
        celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CINZA_ZEBRA } };
      }
      celula.alignment = { horizontal: c === 1 ? "left" : c === 4 ? "center" : "right" };
      aplicarBorda(celula);
    }
  });

  const nLinhaTotal = 5 + transportadores.length;
  const linhaTotal = aba.getRow(nLinhaTotal);
  linhaTotal.getCell(1).value = "TOTAL";
  linhaTotal.getCell(2).value = { formula: `SUM(B5:B${nLinhaTotal - 1})` };
  linhaTotal.getCell(3).value = { formula: `SUM(C5:C${nLinhaTotal - 1})` };
  linhaTotal.getCell(3).numFmt = FORMATO_MOEDA;
  linhaTotal.getCell(4).value = { formula: `SUM(D5:D${nLinhaTotal - 1})` };
  linhaTotal.getCell(4).numFmt = "0.0%";
  for (let c = 1; c <= 4; c++) {
    const celula = linhaTotal.getCell(c);
    celula.font = { bold: true };
    celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AMBAR } };
    celula.alignment = { horizontal: c === 1 ? "left" : "right" };
    aplicarBorda(celula);
  }
  linhaTotal.height = 22;

  return aba;
}

/** Aba simples de "rótulo + quantidade", usada nos panoramas por status. */
export function adicionarAbaContagem(
  wb: ExcelJS.Workbook,
  opcoes: { nome: string; titulo: string; rotuloColuna: string; linhas: { rotulo: string; quantidade: number; valor?: number }[] }
): ExcelJS.Worksheet {
  const { nome, titulo, rotuloColuna, linhas } = opcoes;
  const temValor = linhas.some((l) => l.valor !== undefined);
  const colunas: Coluna<{ rotulo: string; quantidade: number; valor?: number }>[] = [
    { titulo: rotuloColuna, largura: 42, valor: (l) => l.rotulo },
    { titulo: "Pedidos", largura: 14, tipo: "numero", valor: (l) => l.quantidade, somar: true },
  ];
  if (temValor) {
    colunas.push({ titulo: "Valor total", largura: 20, tipo: "moeda", valor: (l) => l.valor ?? 0, somar: true });
  }
  return adicionarAba(wb, { nome, titulo, colunas, itens: linhas });
}

export function novaPlanilha(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Stier · Controle de Entregas";
  wb.created = new Date();
  return wb;
}

export async function planilhaParaBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await wb.xlsx.writeBuffer());
}

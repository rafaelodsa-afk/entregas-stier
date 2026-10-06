// Prefixo travado dos motoristas da frota própria (o cadastro de usuário
// força ele), e o nome do "balde" compartilhado da frota.
export const PREFIXO_FROTA_PROPRIA = "Frota Própria";

// Pedido de veículo da frota que a planilha não vinculou a ninguém. Como
// qualquer motorista pode usar o veículo, o pedido fica visível pra TODOS os
// motoristas da frota própria, e quem pegar assume.
export const FROTA_PROPRIA_COMPARTILHADA = "Frota Própria";

// Nomes alternativos conhecidos (motorista/veículo específico, erro de
// digitação, maiúscula diferente) que na verdade são o MESMO transportador
// — a chave é sempre a forma normalizada (sem espaço nas pontas, minúscula)
// do texto alternativo; o valor é o nome canônico que deve ficar gravado.
// Confirmado com o usuário em 2026-07-28 (ver histórico de mudanças).
const ALIASES_TRANSPORTADOR: Record<string, string> = {
  rumax: "Rumax",
  "rumax - 3/4": "Rumax",
  "rumax 3/4": "Rumax",
  "rumax - alvaro": "Rumax",
  "rumax - álvaro": "Rumax",
  "rumax - diego": "Rumax",
  "rumax - rafinha": "Rumax",
  "rumax caminhão": "Rumax",
  "rumax caminhao": "Rumax",
  "rumax master": "Rumax",
  "rumax master - 1": "Rumax",
  "rumax master - 2": "Rumax",
  contém: "Contém",
  contem: "Contém",
  brothers: "Brothers",
  eixo: "Eixo",
  "jonathan (frota própria - 170)": "Frota Própria – Jonathan",
  "jonathan (frota propria - 170)": "Frota Própria – Jonathan",
  "jonathan (frota própria - 190)": "Frota Própria – Jonathan",
  "jonathan (frota propria - 190)": "Frota Própria – Jonathan",
  "jonathan (frota própria - master)": "Frota Própria – Jonathan",
  "jonathan (frota propria - master)": "Frota Própria – Jonathan",
  jonathan: "Frota Própria – Jonathan",
  "frota própria – jonathan": "Frota Própria – Jonathan",
  "frota propria - jonathan": "Frota Própria – Jonathan",
  "murilo (frota própria - 170)": "Frota Própria – Murilo",
  "murilo (frota propria - 170)": "Frota Própria – Murilo",
  "murilo (frota própria - 190)": "Frota Própria – Murilo",
  "murilo (frota propria - 190)": "Frota Própria – Murilo",
  "murilo (frota própria - master)": "Frota Própria – Murilo",
  "murilo (frota propria - master)": "Frota Própria – Murilo",
  // Variantes que vêm com o motorista nomeado seguem indo pra ele — é dele
  // que a entrega foi, independente de qual veículo da frota ele usou.
  "murilo (master - 190)": "Frota Própria – Murilo",
  "murilo (master - 170)": "Frota Própria – Murilo",
  "murilo (190)": "Frota Própria – Murilo",
  "murilo (170)": "Frota Própria – Murilo",
  murilo: "Frota Própria – Murilo",
  "frota própria – murilo": "Frota Própria – Murilo",
  "frota propria - murilo": "Frota Própria – Murilo",
  // Veículo da frota SEM motorista nomeado na planilha. Qualquer motorista
  // pode rodar com esses carros, então não dá pra adivinhar de quem é a
  // entrega: cai no balde compartilhado, que todo motorista da frota enxerga
  // e qualquer um pode assumir (ver FROTA_PROPRIA_COMPARTILHADA abaixo).
  "master - 190": FROTA_PROPRIA_COMPARTILHADA,
  "master-190": FROTA_PROPRIA_COMPARTILHADA,
  "master 190": FROTA_PROPRIA_COMPARTILHADA,
  "master - 170": FROTA_PROPRIA_COMPARTILHADA,
  "master-170": FROTA_PROPRIA_COMPARTILHADA,
  "master 170": FROTA_PROPRIA_COMPARTILHADA,
  master: FROTA_PROPRIA_COMPARTILHADA,
  "190": FROTA_PROPRIA_COMPARTILHADA,
  "170": FROTA_PROPRIA_COMPARTILHADA,
  "frota própria - 190": FROTA_PROPRIA_COMPARTILHADA,
  "frota propria - 190": FROTA_PROPRIA_COMPARTILHADA,
  "frota própria - 170": FROTA_PROPRIA_COMPARTILHADA,
  "frota propria - 170": FROTA_PROPRIA_COMPARTILHADA,
  "frota própria - master": FROTA_PROPRIA_COMPARTILHADA,
  "frota propria - master": FROTA_PROPRIA_COMPARTILHADA,
  "frota própria": FROTA_PROPRIA_COMPARTILHADA,
  "frota propria": FROTA_PROPRIA_COMPARTILHADA,
};

// Aplica os apelidos conhecidos acima; se o nome não bater com nenhum deles
// (transportador novo, sem alias cadastrado), só limpa os espaços e mantém a
// grafia como veio — não força maiúscula/minúscula em nomes que a gente ainda
// não conhece.
//
// Além de tirar espaço das pontas, colapsa espaço repetido no meio: um nome
// digitado como "Frota Própria –  Murilo" (dois espaços) é o MESMO
// transportador de "Frota Própria – Murilo", e essa diferença invisível já
// deixou um motorista sem enxergar nenhum pedido dele.
export function normalizarNomeTransportador(bruto: string): string {
  const aparado = bruto.trim().replace(/\s+/g, " ");
  const chave = aparado.toLowerCase();
  return ALIASES_TRANSPORTADOR[chave] ?? aparado;
}

/**
 * Chave de comparação de transportador: sem espaço sobrando e sem diferença
 * de maiúscula. É o que o sistema usa pra decidir que dois nomes são o MESMO
 * transportador.
 */
export function chaveTransportador(nome: string | null | undefined): string {
  return (nome ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

const paraComparar = chaveTransportador;

/** Dois nomes de transportador são o mesmo? */
export function mesmoTransportador(a: string | null | undefined, b: string | null | undefined): boolean {
  return chaveTransportador(a) === chaveTransportador(b);
}

/**
 * Recebe os nomes de transportador como estão gravados nos pedidos e devolve
 * UM por transportador, já ordenado, pra montar filtros e listas.
 *
 * Transportador novo entra sozinho: a lista sai dos próprios pedidos, sem
 * cadastro prévio. E se a planilha trouxer a mesma empresa escrita de jeitos
 * diferentes ("Transportes ABC" e "TRANSPORTES ABC"), as duas viram uma
 * opção só — fica a grafia que mais aparece, que normalmente é a certa.
 */
export function agruparTransportadores(nomes: (string | null | undefined)[]): string[] {
  const porChave = new Map<string, Map<string, number>>();
  for (const bruto of nomes) {
    const nome = (bruto ?? "").trim().replace(/\s+/g, " ");
    if (!nome) continue;
    const chave = nome.toLowerCase();
    const grafias = porChave.get(chave) ?? new Map<string, number>();
    grafias.set(nome, (grafias.get(nome) ?? 0) + 1);
    porChave.set(chave, grafias);
  }

  const escolhidos: string[] = [];
  for (const grafias of porChave.values()) {
    let melhor = "";
    let maisVezes = -1;
    for (const [grafia, vezes] of grafias) {
      // Empate fica com a grafia alfabeticamente menor, só pra ser estável
      // entre uma geração e outra.
      if (vezes > maisVezes || (vezes === maisVezes && grafia.localeCompare(melhor, "pt-BR") < 0)) {
        melhor = grafia;
        maisVezes = vezes;
      }
    }
    escolhidos.push(melhor);
  }
  return escolhidos.sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/**
 * É um motorista da frota própria? O cadastro de usuário obriga o prefixo
 * "Frota Própria – " pra esse tipo de conta, então o próprio nome já diz.
 */
export function ehMotoristaDaFrota(transportadorNome: string | null | undefined): boolean {
  const nome = paraComparar(transportadorNome ?? "");
  return nome.startsWith("frota própria") || nome.startsWith("frota propria");
}

/**
 * Todos os nomes de transportador que uma sessão pode enxergar.
 *
 * Transportador terceirizado: só o próprio nome.
 * Motorista da frota própria: o próprio nome MAIS o balde compartilhado da
 * frota — pedido de veículo próprio que a planilha não vinculou a ninguém
 * aparece pra todos os motoristas, e quem pegar assume.
 *
 * Centralizado aqui de propósito: é a regra de isolamento de dados do
 * sistema, e ela precisa ser idêntica na listagem, no painel, na ação sobre
 * um pedido, na abertura de arquivo e na exportação.
 */
export function nomesVisiveisParaTransportador(transportadorNome: string | null | undefined): string[] {
  const nome = (transportadorNome ?? "").trim().replace(/\s+/g, " ");
  if (!nome) return ["___nenhum___"];
  if (!ehMotoristaDaFrota(nome)) return [nome];
  // Evita repetir o mesmo nome caso a conta seja o próprio balde.
  if (paraComparar(nome) === paraComparar(FROTA_PROPRIA_COMPARTILHADA)) return [nome];
  return [nome, FROTA_PROPRIA_COMPARTILHADA];
}

/** Filtro Prisma pronto, sem diferenciar maiúscula/minúscula nem espaço extra. */
export function filtroTransportadorVisivel(transportadorNome: string | null | undefined) {
  const nomes = nomesVisiveisParaTransportador(transportadorNome);
  return { OR: nomes.map((n) => ({ transportador: { equals: n, mode: "insensitive" as const } })) };
}

/** O pedido deste transportador está visível pra essa sessão? */
export function podeAcessarPedidoDoTransportador(
  transportadorDoPedido: string,
  transportadorNomeSessao: string | null | undefined
): boolean {
  const visiveis = nomesVisiveisParaTransportador(transportadorNomeSessao).map(paraComparar);
  return visiveis.includes(paraComparar(transportadorDoPedido));
}

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
  murilo: "Frota Própria – Murilo",
  "frota própria – murilo": "Frota Própria – Murilo",
  "frota propria - murilo": "Frota Própria – Murilo",
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

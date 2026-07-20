// Formata datas-puras (sem hora, tipo "data prevista de entrega") sempre em
// UTC — essencial porque essas datas são gravadas como meia-noite UTC (ver
// parseDataPrevista em lib/pedidos.ts), e mostrar sem fixar o fuso faria o
// dia mudar sozinho dependendo de o servidor rodar no fuso de Brasília
// (dev local) ou UTC (Vercel).
export function formatarDataPura(data: Date | null | undefined): string {
  if (!data) return "—";
  return new Date(data).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

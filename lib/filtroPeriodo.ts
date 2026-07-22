// Compara uma data-pura (guardada como meia-noite UTC, ver parseDataPrevista
// em lib/pedidos.ts) contra um intervalo de "AAAA-MM-DD" vindo de <input
// type="date">. Sem filtro ativo, tudo passa; com filtro ativo, pedidos sem
// a data preenchida ficam de fora (não dá pra confirmar se estão no
// intervalo ou não).
export function dataNoIntervalo(data: Date | null | undefined, inicial: string, final: string): boolean {
  if (!inicial && !final) return true;
  if (!data) return false;
  const chave = new Date(data).toISOString().slice(0, 10);
  if (inicial && chave < inicial) return false;
  if (final && chave > final) return false;
  return true;
}

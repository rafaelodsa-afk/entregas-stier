import { pedidosDoMes } from "@/lib/exportarMes";
import { listarTodosOsArquivosR2 } from "@/lib/r2";

// Usado tanto pra mostrar a "simulação" antes de excluir quanto, de fato,
// na hora de excluir — assim o número mostrado na tela nunca fica
// dessincronizado do que realmente vai ser apagado.
export async function resumoDoMes(mes: string) {
  const [pedidos, arquivos] = await Promise.all([pedidosDoMes(mes), listarTodosOsArquivosR2()]);
  const tamanhoPorChave = new Map(arquivos.map((a) => [a.key, a.size]));

  let totalCanhotos = 0;
  let totalComprovantes = 0;
  let totalBytes = 0;
  const chavesParaExcluir: string[] = [];

  for (const p of pedidos) {
    if (p.canhotoUrl) {
      totalCanhotos++;
      totalBytes += tamanhoPorChave.get(p.canhotoUrl) ?? 0;
      chavesParaExcluir.push(p.canhotoUrl);
    }
    if (p.comprovantePagamentoUrl) {
      totalComprovantes++;
      totalBytes += tamanhoPorChave.get(p.comprovantePagamentoUrl) ?? 0;
      chavesParaExcluir.push(p.comprovantePagamentoUrl);
    }
  }

  return {
    totalPedidos: pedidos.length,
    totalCanhotos,
    totalComprovantes,
    totalArquivos: totalCanhotos + totalComprovantes,
    totalBytes,
    idsPedidos: pedidos.map((p) => p.id),
    chavesParaExcluir,
  };
}

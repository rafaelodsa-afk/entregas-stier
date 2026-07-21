import { pedidosDoMes } from "@/lib/exportarMes";
import { listarTodosOsArquivos } from "@/lib/blobUso";

// Usado tanto pra mostrar a "simulação" antes de excluir quanto, de fato,
// na hora de excluir — assim o número mostrado na tela nunca fica
// dessincronizado do que realmente vai ser apagado.
export async function resumoDoMes(mes: string) {
  const [pedidos, arquivos] = await Promise.all([pedidosDoMes(mes), listarTodosOsArquivos()]);
  const tamanhoPorUrl = new Map(arquivos.map((a) => [a.url, a.size]));

  let totalCanhotos = 0;
  let totalComprovantes = 0;
  let totalBytes = 0;
  const urlsParaExcluir: string[] = [];

  for (const p of pedidos) {
    if (p.canhotoUrl) {
      totalCanhotos++;
      totalBytes += tamanhoPorUrl.get(p.canhotoUrl) ?? 0;
      urlsParaExcluir.push(p.canhotoUrl);
    }
    if (p.comprovantePagamentoUrl) {
      totalComprovantes++;
      totalBytes += tamanhoPorUrl.get(p.comprovantePagamentoUrl) ?? 0;
      urlsParaExcluir.push(p.comprovantePagamentoUrl);
    }
  }

  return {
    totalPedidos: pedidos.length,
    totalCanhotos,
    totalComprovantes,
    totalArquivos: totalCanhotos + totalComprovantes,
    totalBytes,
    idsPedidos: pedidos.map((p) => p.id),
    urlsParaExcluir,
  };
}

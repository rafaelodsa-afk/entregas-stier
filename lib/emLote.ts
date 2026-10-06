// Executa uma ação para muitos itens sem disparar tudo de uma vez.
//
// As ações em lote antes faziam Promise.allSettled com a lista inteira: com
// 10 ou 20 pedidos passava, mas agora que dá pra selecionar centenas isso
// viraria centenas de requisições simultâneas — o servidor responderia com
// erro ou estouraria o tempo limite, e o pior é que parte dos pedidos teria
// sido alterada e parte não, sem a pessoa saber quais.
//
// Aqui no máximo LIMITE_SIMULTANEO ficam em andamento ao mesmo tempo; os
// outros esperam a vez. Nada é interrompido no meio por causa de uma falha:
// os erros são contados e devolvidos no fim, junto com os ids que falharam,
// pra tela poder dizer exatamente o que não deu certo.
export const LIMITE_SIMULTANEO = 6;

export type ResultadoLote<T> = {
  concluidos: number;
  falhas: T[];
};

export async function executarEmLote<T>(
  itens: T[],
  tarefa: (item: T) => Promise<unknown>,
  opcoes: { limite?: number; onProgresso?: (feitos: number, total: number) => void } = {}
): Promise<ResultadoLote<T>> {
  const limite = Math.max(1, opcoes.limite ?? LIMITE_SIMULTANEO);
  const total = itens.length;
  const falhas: T[] = [];
  let proximo = 0;
  let feitos = 0;

  async function trabalhador() {
    while (true) {
      const indice = proximo;
      proximo += 1;
      if (indice >= total) return;
      const item = itens[indice];
      try {
        await tarefa(item);
      } catch {
        falhas.push(item);
      }
      feitos += 1;
      opcoes.onProgresso?.(feitos, total);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limite, total) }, trabalhador));
  return { concluidos: total - falhas.length, falhas };
}

import { list } from "@vercel/blob";

export type ArquivoBlob = { url: string; pathname: string; size: number; uploadedAt: Date };

// Percorre todas as páginas da listagem do Vercel Blob (a API devolve no
// máximo 1000 por vez) até não sobrar cursor — usado tanto pra somar o
// espaço total usado quanto, mais pra frente, pra achar os arquivos de um
// mês específico na hora de exportar/excluir.
export async function listarTodosOsArquivos(): Promise<ArquivoBlob[]> {
  const arquivos: ArquivoBlob[] = [];
  let cursor: string | undefined;
  do {
    const resultado = await list({ cursor, limit: 1000 });
    for (const b of resultado.blobs) {
      arquivos.push({ url: b.url, pathname: b.pathname, size: b.size, uploadedAt: b.uploadedAt });
    }
    cursor = resultado.hasMore ? resultado.cursor : undefined;
  } while (cursor);
  return arquivos;
}

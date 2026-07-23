import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// R2 é compatível com S3 — mesmo SDK da AWS, só trocando endpoint e
// credenciais. "region: auto" é o valor esperado pelo R2 (ele não usa
// regiões de verdade como a AWS).
const client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME!;

export const TIPOS_PERMITIDOS = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

// O bucket é privado — toda visualização (canhoto, comprovante) passa por
// uma URL assinada temporária, gerada na hora de montar a página. Depois
// desse prazo o link para de funcionar (mas pode gerar outro a qualquer
// momento, é só reabrir a página).
export async function gerarUrlVisualizacao(chave: string, segundosValidade = 3600): Promise<string> {
  const comando = new GetObjectCommand({ Bucket: BUCKET, Key: chave });
  return getSignedUrl(client, comando, { expiresIn: segundosValidade });
}

// URL assinada de upload direto do navegador pro R2 — o navegador manda o
// arquivo direto pro R2 usando essa URL, sem passar pelo servidor do site
// (mesma ideia de antes com o Vercel Blob, só que agora o protocolo é S3).
export async function gerarUrlUpload(chave: string, tipoConteudo: string, segundosValidade = 300): Promise<string> {
  const comando = new PutObjectCommand({ Bucket: BUCKET, Key: chave, ContentType: tipoConteudo });
  return getSignedUrl(client, comando, { expiresIn: segundosValidade });
}

export async function apagarArquivosR2(chaves: string[]): Promise<void> {
  const validas = chaves.filter(Boolean);
  if (validas.length === 0) return;
  // DeleteObjects aceita no máximo 1000 chaves por chamada.
  for (let i = 0; i < validas.length; i += 1000) {
    const lote = validas.slice(i, i + 1000);
    await client.send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: lote.map((Key) => ({ Key })) } }));
  }
}

// Assinatura binária (primeiros bytes) de cada tipo permitido — confirma que
// o arquivo é DE VERDADE o que ele diz ser, em vez de confiar só no
// Content-Type que o navegador declarou no upload (fácil de forjar chamando
// a API de upload direto, sem passar pela tela).
const ASSINATURAS: Record<string, (b: Buffer) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/webp": (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
  "application/pdf": (b) => b.subarray(0, 4).toString("ascii") === "%PDF",
};

export const TAMANHO_MAXIMO_ARQUIVO = 20 * 1024 * 1024; // 20 MB

// Confere, DEPOIS do upload direto pro R2, se o arquivo é realmente do tipo
// que foi declarado no presign (pelos primeiros bytes, não pela extensão do
// nome) e se não passa do tamanho máximo. Chamado antes de aceitar a chave
// e vincular ao pedido — se falhar, o arquivo é apagado do R2.
export async function arquivoValido(chave: string): Promise<boolean> {
  try {
    const comando = new GetObjectCommand({ Bucket: BUCKET, Key: chave, Range: "bytes=0-15" });
    const resposta = await client.send(comando);
    if (!resposta.Body || !resposta.ContentType) return false;
    // Content-Range vem como "bytes 0-15/<tamanho total>" quando o objeto é
    // maior que o range pedido — extrai o tamanho total pra checar o limite.
    const tamanhoTotal = Number(resposta.ContentRange?.split("/")[1] ?? resposta.ContentLength ?? 0);
    if (tamanhoTotal > TAMANHO_MAXIMO_ARQUIVO) return false;
    const verificador = ASSINATURAS[resposta.ContentType];
    if (!verificador) return false;
    const bytes = Buffer.from(await resposta.Body.transformToByteArray());
    return verificador(bytes);
  } catch {
    return false;
  }
}

export type ArquivoR2 = { key: string; size: number; uploadedAt: Date };

export async function listarTodosOsArquivosR2(): Promise<ArquivoR2[]> {
  const arquivos: ArquivoR2[] = [];
  let continuationToken: string | undefined;
  do {
    const resposta = await client.send(new ListObjectsV2Command({ Bucket: BUCKET, ContinuationToken: continuationToken }));
    for (const objeto of resposta.Contents ?? []) {
      if (objeto.Key) arquivos.push({ key: objeto.Key, size: objeto.Size ?? 0, uploadedAt: objeto.LastModified ?? new Date() });
    }
    continuationToken = resposta.IsTruncated ? resposta.NextContinuationToken : undefined;
  } while (continuationToken);
  return arquivos;
}

// Busca o conteúdo binário direto do R2 (servidor-a-servidor) — usado na
// exportação de mês, que roda inteira no servidor e não precisa de URL
// assinada, só do arquivo em si pra colocar dentro do .zip.
export async function baixarArquivoR2(chave: string): Promise<Buffer | null> {
  try {
    const resposta = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: chave }));
    if (!resposta.Body) return null;
    const bytes = await resposta.Body.transformToByteArray();
    return Buffer.from(bytes);
  } catch {
    return null;
  }
}

// Prepara um pedido (ou qualquer objeto com esses dois campos) trocando as
// chaves de arquivo guardadas no banco por URLs assinadas prontas pra
// exibir — chamado sempre que uma tela vai mostrar "Ver canhoto"/"Ver
// comprovante".
export async function comLinksAssinados<T extends { canhotoUrl?: string | null; comprovantePagamentoUrl?: string | null }>(
  pedido: T
): Promise<T> {
  const [canhotoUrl, comprovantePagamentoUrl] = await Promise.all([
    pedido.canhotoUrl ? gerarUrlVisualizacao(pedido.canhotoUrl) : Promise.resolve(pedido.canhotoUrl ?? null),
    pedido.comprovantePagamentoUrl ? gerarUrlVisualizacao(pedido.comprovantePagamentoUrl) : Promise.resolve(pedido.comprovantePagamentoUrl ?? null),
  ]);
  return { ...pedido, canhotoUrl, comprovantePagamentoUrl };
}

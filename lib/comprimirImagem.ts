// Redimensiona e recomprime fotos (canhoto/comprovante) no navegador antes
// do upload, pra não gastar o limite gratuito do Vercel Blob com fotos de
// celular de 3-8MB quando 200-400KB já bastam pra ler o documento.
// PDFs passam direto (não dá pra "redimensionar" um PDF com canvas).
const LADO_MAXIMO = 1280;
const QUALIDADE_JPEG = 0.72;

export async function comprimirImagem(arquivo: File): Promise<File> {
  if (!arquivo.type.startsWith("image/")) return arquivo;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(arquivo);
  } catch {
    // Navegador sem suporte a createImageBitmap (raro) — envia o original.
    return arquivo;
  }

  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
  const largura = Math.max(1, Math.round(bitmap.width * escala));
  const altura = Math.max(1, Math.round(bitmap.height * escala));

  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return arquivo;
  }
  ctx.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close();

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALIDADE_JPEG));
  if (!blob || blob.size >= arquivo.size) return arquivo;

  const nomeComprimido = arquivo.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], nomeComprimido, { type: "image/jpeg" });
}

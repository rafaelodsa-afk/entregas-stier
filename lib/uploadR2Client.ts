// Upload direto do navegador pro R2: pede uma URL assinada de upload pro
// servidor, manda o arquivo direto pra ela (não passa pelo servidor do
// site), e devolve só a chave (key) pra guardar no banco.
export async function enviarArquivoParaR2(
  arquivo: File,
  pasta: "canhotos" | "comprovantes-pagamento",
  pedidoId: string
): Promise<{ key: string; tipo: "foto" | "pdf" }> {
  const resPresign = await fetch("/api/r2/presign-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pasta,
      pedidoId,
      nomeArquivo: arquivo.name,
      tipoConteudo: arquivo.type,
    }),
  });
  if (!resPresign.ok) {
    const data = await resPresign.json().catch(() => ({}));
    throw new Error(data.erro || "Não foi possível preparar o upload.");
  }
  const { url, key } = await resPresign.json();

  const resUpload = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": arquivo.type },
    body: arquivo,
  });
  if (!resUpload.ok) {
    throw new Error("Não foi possível enviar o arquivo.");
  }

  return { key, tipo: arquivo.type.startsWith("image/") ? "foto" : "pdf" };
}

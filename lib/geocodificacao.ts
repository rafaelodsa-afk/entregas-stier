import { prisma } from "@/lib/db";

export type Coordenada = { cidade: string; latitude: number; longitude: number };

// Busca coordenadas aproximadas (nível cidade) usando o Nominatim, serviço
// gratuito do OpenStreetMap — não precisa de chave de API. A política de uso
// deles pede no máximo 1 requisição por segundo e um identificativo próprio,
// por isso guardamos o resultado no banco e só buscamos cidades novas.
async function buscarCoordenadaNoNominatim(cidade: string): Promise<{ latitude: number; longitude: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&country=Brazil&city=${encodeURIComponent(cidade)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "stier-controle-entregas/1.0 (app interno de logistica)" },
  });
  if (!res.ok) return null;
  const dados = await res.json();
  if (!Array.isArray(dados) || dados.length === 0) return null;
  const { lat, lon } = dados[0];
  return { latitude: parseFloat(lat), longitude: parseFloat(lon) };
}

// Recebe uma lista de nomes de cidade e devolve as coordenadas de cada uma
// (do cache quando já tiver, buscando no serviço externo só as que faltam).
// Quantas cidades novas podem ser buscadas no serviço externo em UMA abertura
// de tela. Cada cidade nova custa uma ida ao Nominatim mais 1,1s de espera
// obrigatória; sem esse teto, uma planilha que trouxesse 20 cidades novas
// deixaria a tela de Gráficos mais de 20 segundos carregando (ou estourando o
// tempo limite do servidor). As que sobrarem são buscadas nas próximas
// aberturas, até o cache ficar completo — o mapa só fica sem esses pontos
// enquanto isso.
const MAXIMO_CIDADES_NOVAS_POR_VEZ = 3;

export async function obterCoordenadasDasCidades(nomesCidade: string[]): Promise<Coordenada[]> {
  const cidadesUnicas = [...new Set(nomesCidade.map((c) => c.trim()).filter(Boolean))];
  if (cidadesUnicas.length === 0) return [];

  const emCache = await prisma.cidadeCoordenada.findMany({
    where: { cidade: { in: cidadesUnicas } },
  });
  const cacheadas = new Set(emCache.map((c) => c.cidade));
  const faltando = cidadesUnicas.filter((c) => !cacheadas.has(c)).slice(0, MAXIMO_CIDADES_NOVAS_POR_VEZ);

  const novas: Coordenada[] = [];
  for (const cidade of faltando) {
    const coord = await buscarCoordenadaNoNominatim(cidade);
    if (coord) {
      novas.push({ cidade, ...coord });
      await prisma.cidadeCoordenada.upsert({
        where: { cidade },
        update: { latitude: coord.latitude, longitude: coord.longitude, atualizadoEm: new Date() },
        create: { cidade, latitude: coord.latitude, longitude: coord.longitude },
      });
    }
    // Respeita o limite de 1 req/s do Nominatim quando há mais de uma cidade nova.
    if (faltando.length > 1) await new Promise((r) => setTimeout(r, 1100));
  }

  return [
    ...emCache.map((c) => ({ cidade: c.cidade, latitude: c.latitude, longitude: c.longitude })),
    ...novas,
  ];
}

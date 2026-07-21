// Limites do plano GRATUITO de cada serviço, conforme em 2026. Provedores
// mudam esses valores de vez em quando (pra mais ou pra menos) sem
// necessariamente avisar com destaque — vale a pena conferir de tempos em
// tempos em:
//   Neon (Postgres):    https://neon.tech/docs/introduction/plans
//   Cloudflare R2:       https://developers.cloudflare.com/r2/pricing/
export const LIMITE_BANCO_BYTES = 0.5 * 1024 * 1024 * 1024; // 0,5 GB — Neon free tier
export const LIMITE_R2_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB — Cloudflare R2 free tier (Standard storage)

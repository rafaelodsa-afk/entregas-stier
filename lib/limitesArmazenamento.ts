// Limites do plano GRATUITO de cada serviço, conforme em 2026. Provedores
// mudam esses valores de vez em quando (pra mais ou pra menos) sem
// necessariamente avisar com destaque — vale a pena conferir de tempos em
// tempos em:
//   Neon (Postgres):    https://neon.tech/docs/introduction/plans
//   Vercel Blob:        https://vercel.com/docs/storage/vercel-blob/usage-and-pricing
export const LIMITE_BANCO_BYTES = 0.5 * 1024 * 1024 * 1024; // 0,5 GB — Neon free tier
export const LIMITE_BLOB_BYTES = 1 * 1024 * 1024 * 1024; // 1 GB — Vercel Blob free tier (Hobby)

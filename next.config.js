/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // não trava o build por causa de aviso de lint durante o deploy
    ignoreDuringBuilds: true,
  },
  // Não revela "Next.js" no cabeçalho X-Powered-By das respostas.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Impede que o site seja carregado dentro de um <iframe> em
          // outro domínio (clickjacking).
          { key: "X-Frame-Options", value: "DENY" },
          // Impede o navegador de "adivinhar" o tipo de um arquivo
          // diferente do Content-Type declarado (mitiga confusão de tipo
          // em arquivos enviados por upload).
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Só manda o domínio de origem como referrer pra outros sites,
          // nunca a URL completa (que pode ter dados sensíveis na query).
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Força HTTPS por 1 ano (o site já só roda em HTTPS na Vercel;
          // isso deixa isso explícito pro navegador lembrar sozinho).
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;

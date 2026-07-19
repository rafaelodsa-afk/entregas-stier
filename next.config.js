/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // não trava o build por causa de aviso de lint durante o deploy
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;

// Popula o banco com os mesmos dados de demonstração do protótipo,
// para conferir que tudo funciona antes de usar dados reais.
// Rodar com: npm run db:seed

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function hash(senha: string) {
  return bcrypt.hash(senha, 12);
}

async function main() {
  const usuarios = [
    {
      username: "admin",
      senhaHash: await hash("stier2026"),
      nome: "Administrador Stier",
      papel: "MASTER" as const,
      podeCriarUsuarios: true,
    },
    {
      username: "contem",
      senhaHash: await hash("cont1234"),
      nome: "Transportadora Contém",
      papel: "TRANSPORTADOR" as const,
      tipoConta: "TRANSPORTADOR" as const,
      transportadorNome: "Contém",
    },
    {
      username: "rudimar",
      senhaHash: await hash("rudi1234"),
      nome: "Rudimar Transportes",
      papel: "TRANSPORTADOR" as const,
      tipoConta: "TRANSPORTADOR" as const,
      transportadorNome: "Rudimar",
    },
    {
      username: "frotam",
      senhaHash: await hash("frot1234"),
      nome: "Motorista Frota Própria",
      papel: "TRANSPORTADOR" as const,
      tipoConta: "MOTORISTA" as const,
      transportadorNome: "Frota Própria – Master",
    },
    {
      username: "analista",
      senhaHash: await hash("anal1234"),
      nome: "Analista Stier",
      papel: "ANALISTA" as const,
    },
  ];

  for (const u of usuarios) {
    await prisma.usuario.upsert({
      where: { username: u.username },
      update: {},
      create: u,
    });
  }

  const pedidos = [
    { id: "100901", cliente: "Mercado Central Ltda", cidade: "Igrejinha", bairro: "Centro", rua: "Rua Nestor Cordeiro", numero: "450", transportador: "Contém", formaPagamento: "PIX", valorPedido: 2340.5, statusEntrega: "EM_ROTA" as const },
    { id: "100902", cliente: "Distribuidora Serra Verde", cidade: "Taquara", bairro: "São Bento", rua: "Av. Emílio João Kohls", numero: "1200", transportador: "Contém", formaPagamento: "BOLETO", valorPedido: 5670, statusEntrega: "AGUARDANDO_CARREGAMENTO" as const },
    { id: "100905", cliente: "Mercearia Boa Vista", cidade: "Três Coroas", bairro: "Centro", rua: "Rua Getúlio Vargas", numero: "210", transportador: "Rudimar", formaPagamento: "PIX", valorPedido: 1875, statusEntrega: "AGUARDANDO_ACEITE" as const },
    { id: "100906", cliente: "Supermercado Gramado", cidade: "Gramado", bairro: "Centro", rua: "Av. Borges de Medeiros", numero: "2100", transportador: "Rudimar", formaPagamento: "BOLETO", valorPedido: 8900, statusEntrega: "EM_ROTA" as const },
    { id: "100911", cliente: "Mercado Popular", cidade: "Porto Alegre", bairro: "Centro Histórico", rua: "Av. Salgado Filho", numero: "300", transportador: "Frota Própria – Master", formaPagamento: "PIX", valorPedido: 1560, statusEntrega: "EM_ROTA" as const },
    { id: "100912", cliente: "Padaria São José", cidade: "Novo Hamburgo", bairro: "Centro", rua: "Rua General Osório", numero: "640", transportador: "Frota Própria – Master", formaPagamento: "DINHEIRO", valorPedido: 420, statusEntrega: "AGUARDANDO_ACEITE" as const },
  ];

  for (const p of pedidos) {
    await prisma.pedido.upsert({
      where: { id: p.id },
      update: {},
      create: p,
    });
  }

  console.log(`Seed concluído: ${usuarios.length} usuários, ${pedidos.length} pedidos.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

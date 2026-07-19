# Stier · Controle de Entregas (versão de produção — Fase 1)

Aplicativo real (Next.js + banco de dados Postgres + login com senha
criptografada de verdade) para controle de entregas entre Stier, transportadores
e motoristas da frota própria.

## O que já está pronto nesta fase

- Login seguro (senha com hash bcrypt, sessão em cookie assinado — nada de
  senha em texto puro em lugar nenhum)
- Banco de dados real (Postgres) guardando pedidos e usuários de verdade,
  com histórico de mudanças de status
- Controle de acesso por papel:
  - **Transportador / Motorista**: só vê e mexe nos próprios pedidos
  - **Admin / Master**: vê e mexe em tudo
  - **Analista da Stier**: vê e mexe em tudo, menos gerenciar usuários
- Fluxo de status (aceitar → carregar → em rota → entregue), reportar problema
  (reentrega/devolvido/cancelado), e confirmar acerto financeiro

## O que ainda falta (próximas fases, a seu pedido)

- Upload de canhoto com armazenamento de arquivo real (foto/PDF)
- Importar pedidos por planilha (.xlsx/.csv)
- Gráficos (panorama e por transportador) e mapa de entregas pendentes
- Tela de gerenciar usuários (criar/desativar acessos pela interface)

Essas peças já existem funcionando no protótipo interativo que fizemos antes —
vamos portar uma de cada vez pra cá, como você preferir.

---

## 1. Rodando no seu computador (antes de publicar)

Pré-requisitos: [Node.js](https://nodejs.org) 18 ou mais novo instalado.

```bash
# 1. Entre na pasta do projeto
cd stier-producao

# 2. Instale as dependências
npm install

# 3. Copie o arquivo de exemplo de variáveis de ambiente
cp .env.example .env
```

Agora abra o `.env` e preencha:

- `DATABASE_URL`: veja o passo 2 abaixo para conseguir essa string
- `JWT_SECRET`: rode `openssl rand -base64 32` no terminal e cole o resultado
  (no Windows, pode gerar em https://generate-secret.vercel.app/32)

```bash
# 4. Crie as tabelas no banco
npx prisma db push

# 5. Popule com os dados de demonstração (mesmos usuários/pedidos do protótipo)
npm run db:seed

# 6. Rode localmente
npm run dev
```

Abra http://localhost:3000 — deve cair na tela de login. Use `admin` / `stier2026`
para entrar como administrador.

---

## 2. Criando o banco de dados (grátis, leva 2 minutos)

Recomendo o [Neon](https://neon.tech) (Postgres gratuito, feito sob medida pra
usar com Vercel):

1. Crie uma conta em neon.tech (dá pra entrar com GitHub)
2. Crie um novo projeto/banco
3. Copie a "Connection string" que eles mostram — é isso que vai no `DATABASE_URL`

Alternativa: [Vercel Postgres](https://vercel.com/storage/postgres), que se
conecta automaticamente ao projeto quando você publica no Vercel (pula até o
passo 3 e volta aqui depois).

---

## 3. Publicando no Vercel (o site fica no ar)

1. Crie um repositório novo no GitHub e suba o código desta pasta para lá
   (`git init`, `git add .`, `git commit -m "primeira versão"`, depois conectar
   ao repositório remoto e `git push`)
2. Crie uma conta em [vercel.com](https://vercel.com) (dá pra entrar com GitHub)
3. "Add New Project" → escolha o repositório que você acabou de subir
4. Em "Environment Variables", adicione:
   - `DATABASE_URL` (a string de conexão do passo 2)
   - `JWT_SECRET` (o texto secreto que você gerou)
5. Clique em Deploy

O Vercel te dá uma URL tipo `stier-controle.vercel.app` já funcionando. Depois
de publicado, rode uma vez (do seu computador, apontando pro banco de produção,
ou via terminal do Vercel):

```bash
npx prisma db push
npm run db:seed
```

isso cria as tabelas e os usuários de demonstração no banco de produção.

---

## 4. Colocando no domínio próprio (entregas.stier.com.br)

1. No painel do projeto no Vercel, vá em **Settings → Domains**
2. Adicione `entregas.stier.com.br`
3. O Vercel mostra um registro DNS (tipo CNAME) pra você cadastrar onde o
   domínio `stier.com.br` está registrado (Registro.br, GoDaddy, etc.)
4. Depois de propagar (geralmente minutos, às vezes até 24h), o site já
   responde nesse endereço com certificado HTTPS automático

---

## Avisos de segurança importantes

- **Troque as senhas de demonstração** (`stier2026`, `cont1234`, etc.) antes de
  usar com dados reais — são só para teste.
- **Nunca** compartilhe o `.env` nem o `JWT_SECRET` publicamente ou pelo
  WhatsApp — quem tiver esse segredo consegue forjar sessões de login.
- Se algum dia migrar de servidor/serviço, gere um `JWT_SECRET` novo — isso
  derruba todas as sessões ativas (todo mundo precisa logar de novo), o que é
  o comportamento esperado e seguro.

---

## Estrutura do projeto

```
app/
  login/          → tela de login
  dashboard/
    admin/         → painel do admin/analista (vê tudo)
    operador/      → painel do transportador/motorista (só os próprios)
  api/
    auth/          → login e logout
    pedidos/       → listar, criar, e atualizar pedidos
lib/
  auth.ts          → hash de senha, sessão (JWT em cookie)
  db.ts            → conexão com o banco (Prisma)
middleware.ts      → protege as rotas por login/papel
prisma/
  schema.prisma    → estrutura do banco de dados
  seed.ts          → dados de demonstração
```

Qualquer dúvida ou próximo passo, é só pedir por aqui.

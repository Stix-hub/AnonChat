# chatanon 💬

Chat anônimo em tempo real estilo Omegle — Next.js + Supabase + Vercel.

---

## Como rodar

### 1. Instalar dependências
```bash
npm install
```

### 2. Configurar Supabase

1. Crie uma conta em [supabase.com](https://supabase.com)
2. Crie um novo projeto
3. Vá em **SQL Editor** e cole o conteúdo de `supabase_schema.sql` e execute
4. Vá em **Project Settings > API** e copie a URL e a chave anon

### 3. Configurar variáveis de ambiente

Copie o arquivo de exemplo:
```bash
cp .env.local.example .env.local
```

Preencha com suas chaves do Supabase:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_aqui
```

### 4. Rodar localmente
```bash
npm run dev
```

Acesse: http://localhost:3000

---

## Deploy na Vercel

1. Suba o projeto no GitHub
2. Acesse [vercel.com](https://vercel.com) e importe o repositório
3. Adicione as variáveis de ambiente no painel da Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy automático!

---

## Regras do chat

- Sem links (bloqueio automático)
- 2 segundos entre mensagens
- Máximo 100 caracteres por mensagem

---

## Estrutura do projeto

```
chatanon/
├── components/
│   └── Chat.js           ← componente principal do chat
├── lib/
│   └── supabase.js       ← cliente Supabase
├── pages/
│   ├── _app.js           ← app wrapper
│   └── index.js          ← página principal
├── styles/
│   └── globals.css       ← estilos globais
├── supabase_schema.sql   ← schema do banco (execute no Supabase)
├── .env.local.example    ← exemplo de variáveis de ambiente
└── package.json
```

## Tabelas no Supabase

| Tabela | Descrição |
|--------|-----------|
| `queue` | Fila de usuários aguardando conexão |
| `rooms` | Salas de chat entre dois usuários |
| `messages` | Mensagens em tempo real |

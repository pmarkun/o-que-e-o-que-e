# O que é o que é?

Um site mobile-first para explicar qualquer assunto em poucas linhas, em linguagem simples e com fontes. A URL é o produto: `/politica`, `/amor`, `/inteligencia-artificial`.

Cada explicação tem de 160 a 300 caracteres: espaço suficiente para definir, mostrar o mecanismo e dar uma consequência ou exemplo, sem virar um artigo.

## Como funciona

1. O navegador pede `GET /api/entries/:tema`.
2. Se o verbete existe no SQLite, ele volta imediatamente.
3. Se ainda não existe, o servidor verifica palavras raras no Wikcionário e chama o Gemini 2.5 Flash-Lite sem reasoning, com saída JSON estruturada.
4. Uma palavra válida é preservada; um erro ortográfico inequívoco redireciona para a URL canônica da palavra corrigida.
5. O servidor consulta a Wikipédia em português e só inclui links verificados da Wikipédia ou do Wikcionário.
5. A primeira resposta é salva como versão publicada; acessos simultâneos ao mesmo tema compartilham a mesma geração.
6. Correções dos leitores são protegidas contra automação e salvas como versões pendentes. Elas aparecem no histórico, mas não alteram automaticamente o texto público.
7. Um administrador compara o texto atual e o sugerido em `/admin`, depois aprova ou rejeita. Só uma aprovação altera o verbete público.

O frontend não exibe se a resposta veio da geração ou do cache.

## Rodar localmente

Requisitos: Node 24. No NixOS, o projeto também oferece um `flake.nix`.

```bash
cp .env.example .env.local
# preencha a chave Gemini e as variáveis administrativas em .env.local
nix develop --command npm install
nix develop --command npm run dev
```

O frontend abre em `http://127.0.0.1:5173`; a API roda em `http://127.0.0.1:3000`.

Para conferir a interface sem consumir a API, inicie o backend de demonstração:

```bash
OQEOQE_DEMO=1 npm run dev
```

Esse modo é explícito e apenas local; a execução normal nunca inventa um fallback se o Gemini estiver indisponível.

## Produção

```bash
npm run build
GEMINI_API_KEY=... npm start
```

O servidor entrega o frontend compilado e a API na mesma porta (`3000` por padrão). Persistir o diretório `data/` é obrigatório em deploys com filesystem efêmero. `DATA_DIR` permite apontar o SQLite para um volume.

Variáveis:

- `GEMINI_API_KEY`, `GOOGLE_API_KEY` ou `HERMES_GEMINI_API_KEY`: credencial do Gemini.
- `GEMINI_MODEL`: padrão `gemini-2.5-flash-lite`, com `thinkingBudget: 0`.
- `DATA_DIR`: padrão `./data`.
- `PORT`: padrão `3000`.
- `HOST`: padrão `127.0.0.1`; use `0.0.0.0` em containers.
- `ADMIN_USERNAME`: usuário único da moderação; padrão `admin`.
- `ADMIN_PASSWORD_HASH`: hash scrypt gerado por `node scripts/hash-password.mjs 'senha longa'`.
- `ADMIN_SESSION_SECRET`: segredo aleatório usado para assinar sessões.
- `BOT_CHALLENGE_SECRET`: segredo aleatório usado no desafio anti-bot.
- `PRESERVE_GENERATED_HISTORY`: `0` substitui revisões automáticas durante o desenvolvimento; use `1` no lançamento oficial.

## Proteções e moderação

O formulário combina campo-isca invisível, desafio assinado com espera mínima de 2,5 segundos, token de uso único e limite de cinco sugestões por IP a cada hora. O login limita tentativas e cria uma sessão de 12 horas em cookie `HttpOnly`, `SameSite=Strict` e `Secure` em produção.

O painel mostra um diff por palavra: branco para conteúdo mantido, coral para removido e azul para adicionado. Sugestões rejeitadas deixam de aparecer no histórico público; sugestões aprovadas tornam-se a versão atual.

## Verificações

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

## Decisões do MVP

- SQLite reduz infraestrutura e já oferece cache e histórico duráveis.
- Sugestões ficam pendentes para impedir que qualquer visitante vandalize um verbete público.
- O backend valida tamanho, URLs e forma da resposta antes de armazenar conteúdo gerado.
- Os limites por IP ficam em memória e reiniciam com o processo. Para tráfego alto ou várias instâncias, a evolução indicada é Redis e um desafio gerenciado como Cloudflare Turnstile.

Os conceitos visuais atuais estão em [`docs/design/mobile-concept-v2-entry.png`](docs/design/mobile-concept-v2-entry.png), [`docs/design/mobile-concept-v2-home.png`](docs/design/mobile-concept-v2-home.png) e [`docs/design/admin-moderation-concept.png`](docs/design/admin-moderation-concept.png).

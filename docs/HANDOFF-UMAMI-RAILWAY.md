# Handoff — Umami centralizado no Railway

## Objetivo

Implantar uma instância **Umami self-hosted** em um projeto separado no Railway e usá-la como serviço central de analytics para vários sites e aplicações.

O primeiro cliente a ser integrado é o projeto **O que é o que é?**, localizado em:

```text
/home/markun/Documents/Codex/2026-08-20-vamos-criar-um-projeto-novo-eu
```

A instalação deve ser reutilizável: cada produto, ambiente ou domínio será cadastrado como um website separado no Umami e receberá seu próprio `data-website-id`.

## Decisão de arquitetura

Criar um projeto Railway independente, sugerido como `analytics`, contendo:

1. Um serviço Umami.
2. Um PostgreSQL exclusivo do Umami.
3. Um domínio público estável para o coletor e o painel, preferencialmente um domínio próprio como `analytics.<dominio>`.
4. O PostgreSQL sem domínio público, acessível somente pelo serviço Umami.

O endpoint do Umami precisa ser público porque o script e os eventos são enviados diretamente pelo navegador dos visitantes. A rede privada do Railway é isolada por projeto e ambiente; não é necessário nem possível depender dela entre o projeto `analytics` e os demais projetos. A conexão **Umami → PostgreSQL**, por outro lado, deve permanecer privada dentro do projeto `analytics`.

Referências:

- [Umami: implantação no Railway](https://docs.umami.is/docs/guides/running-on-railway)
- [Umami: instalação](https://docs.umami.is/docs/install)
- [Umami: variáveis de ambiente](https://docs.umami.is/docs/environment-variables)
- [Umami: equipes e múltiplos websites](https://docs.umami.is/docs/guides/setup-team-workspaces)
- [Railway: rede privada](https://docs.railway.com/networking/private-networking)
- [Railway: domínios públicos e privados](https://docs.railway.com/networking/domains/working-with-domains)

## Requisitos de privacidade e segurança

- Manter os dados na infraestrutura self-hosted; não usar Google Analytics.
- Definir um `APP_SECRET` aleatório e forte, diferente dos segredos das aplicações clientes.
- Definir `DISABLE_TELEMETRY=1` para impedir a telemetria anônima da própria instalação.
- Trocar imediatamente a senha padrão do administrador do Umami.
- Não expor o PostgreSQL publicamente.
- Não colocar segredos no repositório ou no código do frontend.
- O `data-website-id` não é segredo e pode aparecer no HTML; credenciais administrativas e `APP_SECRET` não podem.
- Configurar healthcheck e política de reinício apropriados no Railway.
- Verificar a política de backup e restauração do PostgreSQL antes de considerar a implantação concluída.
- Preferir uma versão fixada do Umami ou um processo explícito de atualização; não atualizar produção automaticamente sem verificar migrações e release notes.
- Evitar dashboard público. Acesso deve exigir login, salvo decisão explícita em contrário.

## Organização recomendada no Umami

- Criar uma equipe/workspace para os produtos do proprietário.
- Cadastrar cada combinação relevante de produto e ambiente separadamente, por exemplo:
  - `O que é o que é? — produção`
  - `O que é o que é? — desenvolvimento` somente se métricas de desenvolvimento forem realmente necessárias
  - futuros produtos, cada um com identificador próprio
- Não misturar produção e staging no mesmo website, para não poluir os dados.
- Se futuramente houver clientes independentes ou exigências jurídicas distintas, avaliar instâncias separadas em vez de apenas equipes separadas.

## Contexto do primeiro cliente

O projeto **O que é o que é?** é uma aplicação React 19 + Vite com servidor Node. A navegação é de SPA: `src/App.tsx` usa `window.history.pushState` e escuta `popstate`. O Umami deve registrar as mudanças de rota, e isso precisa ser verificado no painel em vez de presumido.

Arquivos relevantes:

- `index.html`: ponto mais simples para carregar o tracker.
- `src/App.tsx`: busca, navegação para o verbete e redirecionamento de autocorreção.
- `src/components/EntryView.tsx`: abertura de fonte, sugestão de correção e histórico.
- `src/admin/AdminApp.tsx`: painel administrativo; por padrão, não precisa ser rastreado.
- `.env.example`: documentar apenas configurações públicas necessárias ao build.
- `README.md`: documentar ativação, desativação e validação do analytics.

O site de produção conhecido no momento desta conversa é:

```text
https://web-production-e6b1b.up.railway.app
```

Antes de integrar ou validar, confirmar se este ainda é o endereço correto e se já existe um domínio definitivo.

## Forma de integração recomendada

Não fixar URL e website ID diretamente no código. Usar variáveis públicas do Vite, por exemplo:

```text
VITE_UMAMI_SCRIPT_URL=https://analytics.<dominio>/script.js
VITE_UMAMI_WEBSITE_ID=<uuid-do-website>
```

O tracker deve ser carregado somente quando as duas variáveis estiverem preenchidas. Em desenvolvimento local e testes, a ausência delas deve desativar analytics silenciosamente, sem erro no console.

Pode-se injetar o script pelo React ou por uma pequena transformação no HTML durante o build. Escolher a alternativa mais simples e compatível com o padrão atual do projeto. Não adicionar uma dependência apenas para carregar o tracker.

Não registrar:

- texto integral das sugestões de correção;
- senha, sessão ou ações administrativas sensíveis;
- IP, e-mail ou identificadores pessoais em propriedades customizadas;
- conteúdo livre digitado que possa conter dados pessoais ou ofensas.

Para termos buscados, preferir inicialmente medir volume e resultado da busca. Só enviar o termo/slug como propriedade se houver uma decisão explícita de produto, pois ele pode conter texto livre. O próprio caminho visitado já poderá aparecer como pageview.

## Eventos sugeridos para o MVP

Usar nomes estáveis, em `snake_case`, e propriedades pequenas e controladas:

| Evento | Momento | Propriedades seguras sugeridas |
|---|---|---|
| `search_submitted` | usuário envia uma busca válida | `source: home_or_entry` |
| `entry_loaded` | verbete é exibido | `result: exact_or_redirected` |
| `search_redirected` | erro ortográfico redireciona para o slug correto | nenhuma no MVP ou apenas categoria do resultado |
| `search_refused` | sistema aplica a resposta padrão para termo não atendido | `reason_category`, se produzida pelo backend com enum fechado |
| `source_opened` | usuário abre Wikipédia/Wikcionário | `source_type: wikipedia_or_wiktionary` |
| `suggestion_started` | formulário de correção é aberto | nenhuma |
| `suggestion_submitted` | sugestão é aceita pela API | `status: accepted` |
| `history_opened` | histórico de versões é aberto | nenhuma |

Não duplicar pageviews com eventos sem necessidade. O objetivo é responder perguntas de produto, não coletar tudo indiscriminadamente.

## Etapas de execução

### 1. Descoberta e autorização

- Confirmar conta/workspace Railway corretos.
- Confirmar autorização para criar um novo projeto, banco, domínio e custos recorrentes.
- Confirmar o domínio público desejado para o Umami.
- Verificar se há política de backup já usada pelo proprietário.

### 2. Implantação do Umami

- Usar o template oficial/recomendado ou a imagem oficial do Umami com PostgreSQL.
- Criar o PostgreSQL no mesmo projeto Railway.
- Referenciar `DATABASE_URL` pelo mecanismo de variáveis do Railway, sem copiar credenciais para arquivos.
- Configurar `APP_SECRET`, `DISABLE_TELEMETRY=1`, host e porta conforme a versão atual do Umami exigir.
- Expor somente o serviço Umami em domínio público.
- Configurar healthcheck.
- Confirmar login, trocar senha padrão e guardar a credencial pelo canal de segredos adotado pelo usuário.

### 3. Cadastro do primeiro website

- Criar `O que é o que é? — produção` no Umami com o domínio de produção confirmado.
- Obter o website ID.
- Não habilitar compartilhamento público do dashboard.

### 4. Integração no projeto cliente

- Trabalhar em branch descritiva; este diretório pode não estar inicializado como repositório Git, portanto confirmar a situação antes.
- Implementar carregamento condicional do tracker.
- Adicionar somente os eventos aprovados e úteis.
- Atualizar `.env.example` e `README.md` sem incluir valores reais.
- Preservar o funcionamento do site quando analytics estiver indisponível ou bloqueado.
- O envio de analytics nunca pode impedir busca, navegação, carregamento do verbete ou submissão de correção.

### 5. Validação

- Rodar no ambiente Nix do projeto:

```bash
nix develop --command npm test
nix develop --command npm run lint
nix develop --command npm run typecheck
nix develop --command npm run build
```

- Usar Chrome DevTools conectado para validar, no mínimo:
  - desktop Chromium;
  - viewport mobile estreito;
  - carregamento direto de `/`;
  - carregamento direto de um verbete;
  - navegação SPA entre verbetes;
  - botão voltar/avançar;
  - autocorreção com redirecionamento;
  - abertura de fonte;
  - analytics ausente/bloqueado, confirmando que o produto continua funcionando;
  - ausência de erros novos no console.
- Verificar no painel do Umami que uma navegação SPA gera exatamente o pageview esperado, sem perda e sem duplicidade.
- Verificar que eventos aparecem no website correto e não no ambiente errado.
- Inspecionar a requisição do coletor e confirmar que não contém texto de sugestão, credenciais ou dados pessoais desnecessários.

### 6. Produção

- Não publicar nem alterar produção sem autorização explícita no task atual.
- Quando autorizado, implantar primeiro o Umami, validar saúde e só depois publicar o tracker no cliente.
- Fazer smoke test real no domínio público.
- Entregar URLs do painel e do site, versão implantada, variáveis configuradas apenas pelos nomes, testes executados e limitações restantes.

## Critérios de aceite

- Uma única instalação Umami aceita dados de websites diferentes sem misturá-los.
- O PostgreSQL não possui exposição pública.
- O painel exige autenticação e a senha padrão não funciona mais.
- Telemetria do Umami está desabilitada.
- Pageviews diretos e de navegação SPA aparecem uma única vez no website correto.
- Os eventos de produto aprovados aparecem com nomes e propriedades consistentes.
- Nenhum dado sensível ou conteúdo integral de formulário é enviado.
- O site funciona normalmente quando o tracker falha ou é bloqueado.
- Testes, lint, typecheck e build do cliente passam.
- A validação responsiva e de interação é documentada com viewports e navegador usados.
- Existe uma estratégia confirmada de backup/restauração do banco.

## Fora de escopo inicial

- Incorporar o dashboard do Umami dentro de `/admin`.
- Criar dashboard próprio consumindo a API do Umami.
- Session replay.
- Identificação de usuários individuais.
- Dashboard público.
- Migrar dados históricos de outro analytics.
- Criar consent banner sem haver outro requisito jurídico que o torne necessário.

## Resultado esperado do agente

Ao finalizar, entregar um resumo operacional contendo:

1. Projeto e serviços criados no Railway.
2. URL pública do Umami.
3. Website(s) cadastrados, sem expor segredos.
4. Arquivos alterados no cliente.
5. Eventos implementados.
6. Testes e matriz visual executados.
7. Evidência de pageview e evento recebidos.
8. Estado do deploy de cada serviço.
9. Backup configurado ou risco explicitamente pendente.
10. Qualquer ação manual restante, especialmente DNS e credenciais.

# Web

[English](README.md) · **Português**

A interface do Papert: Next.js 16 e React 19, com um editor Monaco servido pela própria
aplicação.

- **Workspace de estudo:** árvore de arquivos e fontes, o editor e o painel do Seymour.
- **Inteligência do editor:** realce de sintaxe e checagem de tipos TypeScript com pacotes de
  tipos carregados sob demanda a partir dos imports do workspace.
- **Tutor e análise:** respostas em streaming, feedback por critério e citações que abrem em
  um visualizador de fontes dentro da aplicação.
- Páginas de **catálogo, biblioteca, memória e perfil**.

O navegador só conversa com esta aplicação. Os route handlers em `app/api/*` são um proxy com
allowlist para o Core, e a sessão fica em um cookie `HttpOnly` que nunca chega ao código do
cliente.

## Estrutura

```
app/                 rotas; cada pasta de rota guarda os componentes, hooks e testes que só ela usa
  api/               proxy com allowlist para o Core, uma tabela de rotas por módulo do Core
  study/             a rota do workspace, dividida por funcionalidade:
    shell/           moldura da página, navbar e painéis laterais recolhíveis
    home/            lista de roadmaps e a entrada "continuar estudando"
    workspace/       sessão, autosave, conflitos e recuperação
    editor/          Monaco, autocompletar e pacotes de tipos TypeScript
    execution/       estado de requisição, progresso e stream compartilhado por tutor e análise
    attempt/         resultado de uma tentativa: status, achados, dicas, erros de sintaxe
    analysis/  seymour/  challenge/  sources/  viewer/  generation/  feedback/  explorer/
components/ui/       primitivas do design system
components/app/      providers e elementos compartilhados por todas as rotas
lib/                 helpers e hooks compartilhados: cliente da API, sessão, a11y, teclado, formatação
e2e/                 jornadas Playwright
```

O código usado por uma única rota fica na pasta dessa rota e só vai para `components/` ou
`lib/` quando uma segunda rota precisa dele.

## Desenvolvimento

Para rodar a stack inteira, veja o [README do projeto](../../README.pt-BR.md#início-rápido).

```sh
npm ci
npm test                  # node --test sobre *.test.mjs
npm run test:type-packs   # regenera os pacotes de tipos do editor e compila contra eles
npm run lint
npm run typecheck         # next typegen + tsc --noEmit
npm run build
```

Componentes e hooks React ainda não têm testes automatizados; veja as
[lacunas conhecidas](../../docs/testing.md#known-gaps) (em inglês).

## Detalhes internos

[Web client internals](../../docs/web-client.md) (em inglês) explica o proxy para o Core, o
autosave e o tratamento de conflitos, os assets do editor e pacotes de tipos, e os cabeçalhos
de segurança.

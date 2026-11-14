# Web

**English** · [Português](README.pt-BR.md)

Papert's interface: Next.js 16 and React 19, with a self-hosted Monaco editor.

- **Study workspace:** file tree and sources, the editor, and the Seymour panel.
- **Editor intelligence:** syntax highlighting, plus TypeScript type checking against type
  packs that are loaded lazily from the workspace's imports.
- **Tutor and analysis:** streamed answers, feedback per criterion, and citations that open in
  an in-app source viewer.
- **Catalog, library, memory and profile** pages.

The browser only talks to this app. Route handlers under `app/api/*` are an allowlisted proxy
to Core, and the session lives in an `HttpOnly` cookie that never reaches client code.

## Structure

```
app/                 routes; each route folder keeps the components, hooks and tests only it uses
  api/               allowlisted proxy to Core, one route table per Core module
  study/             the workspace route, split by feature:
    shell/           page frame, navbar and collapsible side panels
    home/            roadmap list and "continue studying" entry
    workspace/       session, autosave, conflict and recovery logic
    editor/          Monaco, completions and TypeScript type packs
    execution/       request, progress and stream state shared by tutor and analysis
    attempt/         result of one attempt: status, findings, hints, syntax errors
    analysis/  seymour/  challenge/  sources/  viewer/  generation/  feedback/  explorer/
components/ui/       design-system primitives
components/app/      providers and chrome shared by every route
lib/                 shared helpers and hooks: API client, auth session, a11y, keyboard, formatting
e2e/                 Playwright journeys
```

Code used by one route stays in that route's folder and moves to `components/` or `lib/`
only when a second route needs it.

## Development

To run the whole stack, see the [project README](../../README.md#quick-start).

```sh
npm ci
npm test                  # node --test over *.test.mjs
npm run test:type-packs   # regenerates the editor type packs and compiles against them
npm run lint
npm run typecheck         # next typegen + tsc --noEmit
npm run build
```

React components and hooks are not covered by automated tests yet; see the
[known gaps](../../docs/testing.md#known-gaps).

## Internals

[Web client internals](../../docs/web-client.md) explains the proxy to Core, autosave and
conflict handling, editor assets and type packs, and the security headers.

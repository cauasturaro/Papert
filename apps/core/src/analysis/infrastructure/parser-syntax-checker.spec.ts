import { lintWorkspace } from '../domain/syntax.js';
import { ParserSyntaxChecker } from './parser-syntax-checker.js';

const checker = new ParserSyntaxChecker();

const cases = [
  {
    language: 'TypeScript',
    path: 'src/service.ts',
    valid: 'export const greet = (name: string): string => `Hello ${name}`;\n',
    invalid: 'export const greet = (name: string => {\n  return name;\n',
  },
  {
    language: 'TSX',
    path: 'src/view.tsx',
    valid: 'export const View = () => <p>Hello</p>;\n',
    invalid: 'export const View = () => <p>Hello</div>;\n',
  },
  {
    language: 'Python',
    path: 'app/main.py',
    valid: 'def greet(name: str) -> str:\n    return f"Hello {name}"\n',
    invalid: 'def greet(name:\n    return name\n',
  },
  {
    language: 'YAML',
    path: 'config/app.yaml',
    valid: 'service:\n  port: 8080\n  hosts: [a, b]\n',
    invalid: 'service:\n  hosts: [a, b\nport: 1\n',
  },
  {
    language: 'Dockerfile',
    path: 'Dockerfile',
    valid:
      'ARG NODE=24\nFROM node:${NODE}\nWORKDIR /app\nCOPY . .\nRUN npm ci \\\n  && npm run build\nEXPOSE 3000/tcp\nCMD ["node", "dist/main.js"]\n',
    invalid: 'FROM node:24\nRUNN npm ci\nCOPY package.json\n',
  },
  {
    language: 'SQL',
    path: 'db/schema.sql',
    valid:
      'CREATE TABLE greeting (id SERIAL PRIMARY KEY, name TEXT NOT NULL);\nSELECT name FROM greeting WHERE id = 1;\n',
    invalid: 'CREATE TABLE greeting (id SERIAL PRIMARY KEY,);\n',
  },
  {
    language: 'JSON',
    path: 'package.json',
    valid: '{"name": "service", "private": true}\n',
    invalid: '{"name": "service",\n "private": true,}\n',
  },
];

describe('ParserSyntaxChecker', () => {
  it.each(cases)(
    'accepts valid and rejects invalid $language',
    async (item) => {
      const valid = await lintWorkspace({ [item.path]: item.valid }, checker);
      const invalid = await lintWorkspace(
        { [item.path]: item.invalid },
        checker,
      );

      expect(valid).toMatchObject({
        status: 'passed',
        coverage: 'complete',
        diagnostics: [],
      });

      expect(invalid.status).toBe('failed');
      expect(invalid.diagnostics.length).toBeGreaterThan(0);
      expect(invalid.diagnostics[0]).toMatchObject({ path: item.path });
      expect(invalid.diagnostics[0].line).toBeGreaterThan(0);
    },
  );

  it('reports the line of the first SQL and JSON error', async () => {
    const files = {
      'a.sql': 'SELECT 1;\nSELEC 2;\n',
      'b.json': '{\n  "a": 1,\n  oops\n}\n',
    };

    const report = await lintWorkspace(files, checker);

    expect(report.diagnostics.map(({ path, line }) => [path, line])).toEqual([
      ['a.sql', 2],
      ['b.json', 3],
    ]);
  });

  it('does not expand YAML aliases while checking syntax', async () => {
    const levels = Array.from(
      { length: 12 },
      (_, index) =>
        `l${index + 1}: &l${index + 1} [${Array(9).fill(`*l${index}`).join(', ')}]`,
    );
    const bomb = ['l0: &l0 "x"', ...levels].join('\n');

    const report = await lintWorkspace({ 'bomb.yaml': bomb }, checker);

    expect(report.status).toBe('passed');
  });

  it('never treats unsupported languages as syntactically valid', async () => {
    const files = {
      'README.md': '# Notes',
      'main.go': 'package main\nfunc main( {}',
      'src/': '',
    };

    const report = await lintWorkspace(files, checker);

    expect(report).toEqual({
      status: 'passed',
      coverage: 'none',
      checked: [],
      unchecked: ['README.md', 'main.go'],
      diagnostics: [],
    });
  });
});

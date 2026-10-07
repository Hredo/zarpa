import { transformSync } from '@babel/core';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import type { ObjectExpression } from '@babel/types';
import fs from 'node:fs';
import path from 'node:path';

/*
 * Un worklet (animaciones, gestos, visor) corre en otro hilo y solo puede
 * llamar a otros worklets. Si llama a una función normal, en la versión de
 * producción salta «Tried to synchronously call a Remote Function» y Android
 * cierra la app. Ningún otro test lo ve (en Jest los worklets son simulados),
 * y así se colaba que el visor se cerrase al abrirlo: el indicador del zoom
 * llamaba a `zoomLabel` desde el hilo de la interfaz.
 *
 * Aquí se compila la app con el mismo Babel que el APK y se revisa cada worklet.
 */

const ROOT = path.resolve(__dirname, '..');
// Bibliotecas cuyas funciones están hechas para llamarse desde un worklet.
const WORKLET_LIBS = [
  'react-native-reanimated',
  'react-native-worklets',
  'react-native-gesture-handler',
  '@shopify/react-native-skia',
  'react-native-vision-camera',
];

function compile(code: string, filename: string): string {
  const out = transformSync(code, {
    cwd: ROOT,
    filename,
    babelrc: false,
    configFile: false,
    envName: 'production',
    presets: [require.resolve('babel-preset-expo')],
    caller: { name: 'metro', platform: 'android', isDev: false, bundler: 'metro' } as never,
  });
  return out?.code ?? '';
}

/** Funciones de un módulo compilado que son worklets (por su nombre en el módulo). */
function workletNames(code: string): Set<string> {
  const names = new Set<string>();
  for (const m of code.matchAll(/(?:^|[;,\s])([A-Za-z_$][\w$]*)\.__workletHash=/g)) names.add(m[1]);
  // `const f = () => { 'worklet'; … }` queda como `var f=function XFactory(…)`.
  for (const m of code.matchAll(/(?:var |exports\.)([A-Za-z_$][\w$]*)=(?:exports\.[\w$]+=)?function [\w$]+Factory\(/g)) names.add(m[1]);
  return names;
}

type Module = { file: string; code: string; worklets: Set<string> };

/**
 * Llamadas de un worklet a algo de su cierre que no es un worklet. `resolve`
 * da el módulo de la app que corresponde a un `require` (o null si es externo).
 */
function remoteCalls(mod: Module, resolve: (from: string, spec: string) => Module | null): string[] {
  const ast = parse(mod.code, { sourceType: 'module' });
  const requires = new Map<string, string>();
  const found: string[] = [];

  traverse(ast, {
    VariableDeclarator(p) {
      let init = p.node.init;
      // `_interopRequireDefault(require("x"))` o `require("x")`.
      if (init?.type === 'CallExpression' && init.arguments[0]?.type === 'CallExpression') init = init.arguments[0];
      if (
        p.node.id.type === 'Identifier' &&
        init?.type === 'CallExpression' &&
        init.callee.type === 'Identifier' &&
        init.callee.name === 'require' &&
        init.arguments[0]?.type === 'StringLiteral'
      ) {
        requires.set(p.node.id.name, init.arguments[0].value);
      }
    },
  });

  traverse(ast, {
    ObjectExpression(p) {
      const props = (p.node as ObjectExpression).properties;
      const initProp = props.find(
        (pr) => pr.type === 'ObjectProperty' && pr.key.type === 'Identifier' && /^_worklet_\d+_init_data$/.test(pr.key.name),
      );
      if (!initProp || initProp.type !== 'ObjectProperty' || initProp.key.type !== 'Identifier') return;
      const source = mod.code.match(new RegExp(`var ${initProp.key.name}=\\{code:"((?:[^"\\\\]|\\\\.)*)"`));
      if (!source) return;
      const body = parse(JSON.parse(`"${source[1]}"`) as string, { sourceType: 'script' });
      const called = new Set<string>();
      traverse(body, {
        CallExpression(c) {
          if (c.node.callee.type === 'Identifier') called.add(c.node.callee.name);
        },
      });

      for (const pr of props) {
        if (pr === initProp || pr.type !== 'ObjectProperty' || pr.key.type !== 'Identifier') continue;
        const name = pr.key.name;
        if (!called.has(name)) continue;
        const v = pr.value;
        let ok = false;
        if (v.type === 'MemberExpression' && v.object.type === 'Identifier' && v.property.type === 'Identifier') {
          const spec = requires.get(v.object.name) ?? '';
          const target = resolve(mod.file, spec);
          ok = WORKLET_LIBS.some((l) => spec === l || spec.startsWith(`${l}/`)) || !!target?.worklets.has(v.property.name);
        } else if (v.type === 'Identifier') {
          ok = mod.worklets.has(v.name);
        }
        if (!ok) found.push(`${path.relative(ROOT, mod.file)}: un worklet llama a «${name}», que no es un worklet`);
      }
    },
  });
  return found;
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sourceFiles(p, out);
    else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

function load(files: { file: string; source: string }[]): Map<string, Module> {
  const mods = new Map<string, Module>();
  for (const { file, source } of files) {
    const code = compile(source, file);
    mods.set(file, { file, code, worklets: workletNames(code) });
  }
  return mods;
}

function resolver(mods: Map<string, Module>) {
  return (from: string, spec: string): Module | null => {
    let base: string;
    if (spec.startsWith('@/')) base = path.join(ROOT, 'src', spec.slice(2));
    else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
    else return null;
    for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
      const hit = mods.get(base + ext);
      if (hit) return hit;
    }
    return null;
  };
}

describe('worklets', () => {
  it('detecta un worklet que llama a una función normal (el cierre del visor)', () => {
    const lib = path.join(ROOT, 'src', '__fixture__', 'label.ts');
    const screen = path.join(ROOT, 'src', '__fixture__', 'screen.ts');
    const mods = load([
      { file: lib, source: "export const label = (v: number) => `${v}×`;\nexport function safeLabel(v: number) { 'worklet'; return `${v}×`; }" },
      {
        file: screen,
        source: [
          "import { scheduleOnRN } from 'react-native-worklets';",
          "import { label, safeLabel } from './label';",
          'export const bad = (v: number, set: (s: string) => void) => { "worklet"; scheduleOnRN(set, label(v)); };',
          'export const good = (v: number, set: (s: string) => void) => { "worklet"; scheduleOnRN(set, safeLabel(v)); };',
        ].join('\n'),
      },
    ]);
    const calls = remoteCalls(mods.get(screen)!, resolver(mods));
    expect(calls).toEqual([expect.stringContaining('«label»')]);
  });

  it('ningún worklet de la app llama a una función normal', () => {
    const files = sourceFiles(path.join(ROOT, 'src')).map((file) => ({ file, source: fs.readFileSync(file, 'utf8') }));
    const mods = load(files);
    const resolve = resolver(mods);
    const problems = [...mods.values()].filter((m) => m.code.includes('__closure')).flatMap((m) => remoteCalls(m, resolve));
    expect(problems).toEqual([]);
  }, 180_000);
});

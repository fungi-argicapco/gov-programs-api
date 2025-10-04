import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type ColorVariant = { light: string; dark: string };
type TokenValue = string | number | ColorVariant | TokenRecord;
interface TokenRecord {
  [key: string]: TokenValue;
}

type Tokens = TokenRecord;

type FlattenedScalar = {
  path: string[];
  value: string;
};

type FlattenedColor = {
  path: string[];
  value: ColorVariant;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageDir = __dirname;
const packagesRoot = resolve(packageDir, '..');

async function loadTokens(): Promise<Tokens> {
  const tokensPath = join(__dirname, 'tokens.json');
  const raw = await readFile(tokensPath, 'utf8');
  return JSON.parse(raw) as Tokens;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isColorVariant(value: unknown): value is ColorVariant {
  if (!isPlainObject(value)) return false;
  const { light, dark, ...rest } = value as Record<string, unknown> & ColorVariant;
  const extraKeys = Object.keys(rest);
  return (
    typeof light === 'string' &&
    typeof dark === 'string' &&
    extraKeys.length === 0
  );
}

function toKebabCase(segment: string): string {
  return segment
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase();
}

function toVariableName(path: string[]): string {
  return `--atlas-${path.map(toKebabCase).join('-')}`;
}

function flattenTokens(
  record: TokenRecord,
  prefix: string[] = []
): { scalars: FlattenedScalar[]; colors: FlattenedColor[] } {
  const scalars: FlattenedScalar[] = [];
  const colors: FlattenedColor[] = [];

  for (const [key, value] of Object.entries(record)) {
    const nextPath = [...prefix, key];

    if (isColorVariant(value)) {
      colors.push({ path: nextPath, value });
      continue;
    }

    if (isPlainObject(value)) {
      const nested = flattenTokens(value as TokenRecord, nextPath);
      scalars.push(...nested.scalars);
      colors.push(...nested.colors);
      continue;
    }

    if (typeof value === 'string' || typeof value === 'number') {
      scalars.push({ path: nextPath, value: String(value) });
      continue;
    }

    throw new Error(`Unsupported token value at ${nextPath.join('.')}`);
  }

  return { scalars, colors };
}

function createCss(tokens: Tokens): string {
  const { scalars, colors } = flattenTokens(tokens);
  const rootLines: string[] = [];
  const lightLines: string[] = [];
  const darkLines: string[] = [];

  for (const scalar of scalars) {
    rootLines.push(`  ${toVariableName(scalar.path)}: ${scalar.value};`);
  }

  for (const color of colors) {
    const varName = toVariableName(color.path);
    lightLines.push(`  ${varName}: ${color.value.light};`);
    darkLines.push(`  ${varName}: ${color.value.dark};`);
  }

  const sections: string[] = [];
  sections.push(':root {');
  sections.push('  color-scheme: light;');
  sections.push(...rootLines, ...lightLines);
  sections.push('}');
  sections.push('');
  sections.push('html[data-theme="light"] {');
  sections.push('  color-scheme: light;');
  sections.push(...lightLines);
  sections.push('}');
  sections.push('');
  sections.push('html[data-theme="dark"] {');
  sections.push('  color-scheme: dark;');
  sections.push(...darkLines);
  sections.push('}');

  return sections.join('\n');
}

function createColorVarTree(record: TokenRecord, path: string[] = []): TokenRecord {
  const result: TokenRecord = {};

  for (const [key, value] of Object.entries(record)) {
    const nextPath = [...path, key];
    if (isColorVariant(value)) {
      result[key] = `var(${toVariableName(['color', ...nextPath])})`;
      continue;
    }
    if (isPlainObject(value)) {
      result[key] = createColorVarTree(value as TokenRecord, nextPath);
      continue;
    }
    throw new Error(`Unexpected non-color token inside colors at ${nextPath.join('.')}`);
  }

  return result;
}

function createTailwindPreset(tokens: Tokens): string {
  const colorVars = createColorVarTree(tokens.color as TokenRecord);
  const spacing = tokens.space as Record<string, string>;
  const radius = tokens.radius as Record<string, string>;
  const elevation = tokens.elevation as Record<string, string>;
  const fontFamily = (tokens.type as TokenRecord).fontFamily as Record<string, string>;
  const lineHeight = (tokens.type as TokenRecord).lineHeight as Record<string, string>;
  const letterSpacing = (tokens.type as TokenRecord).letterSpacing as Record<string, string>;
  const fontScale = (tokens.type as TokenRecord).scale as Record<
    string,
    { fontSize: string; lineHeight: string }
  >;
  const transitionDuration = (tokens.motion as TokenRecord).duration as Record<string, string>;
  const transitionTimingFunction = (tokens.motion as TokenRecord).easing as Record<string, string>;
  const zIndex = tokens.zIndex as Record<string, number>;

  const fontSize: Record<string, [string, { lineHeight: string }]> = {};
  for (const [key, value] of Object.entries(fontScale)) {
    fontSize[key] = [value.fontSize, { lineHeight: value.lineHeight }];
  }

  const preset = {
    theme: {
      extend: {
        colors: colorVars,
        spacing,
        borderRadius: radius,
        boxShadow: Object.fromEntries(
          Object.entries(elevation).map(([key, shadow]) => [key, `var(${toVariableName(['elevation', key])})`])
        ),
        fontFamily,
        fontSize,
        lineHeight,
        letterSpacing,
        transitionDuration,
        transitionTimingFunction,
        zIndex
      }
    }
  };

  return `module.exports = ${JSON.stringify(preset, null, 2)};\n`;
}

function escapeSingleQuotes(value: string): string {
  return value.replace(/'/g, "\\'");
}

function createTypeDefinition(value: TokenValue, indent = 1): string {
  const padding = '  '.repeat(indent);
  const closingPadding = '  '.repeat(indent - 1);

  if (typeof value === 'string') {
    return `'${escapeSingleQuotes(value)}'`;
  }

  if (typeof value === 'number') {
    return `${value}`;
  }

  if (isColorVariant(value)) {
    return `{
${padding}light: '${escapeSingleQuotes(value.light)}';
${padding}dark: '${escapeSingleQuotes(value.dark)}';
${closingPadding}}`;
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value)
      .map(([key, child]) => `${padding}'${key}': ${createTypeDefinition(child as TokenValue, indent + 1)};`)
      .join('\n');
    return `{
${entries}
${closingPadding}}`;
  }

  throw new Error('Unsupported token value type in type definition');
}

function createDts(tokens: Tokens): string {
  const typeLiteral = createTypeDefinition(tokens as TokenValue, 1);
  return `declare const tokens: ${typeLiteral};
export type AtlasTokens = typeof tokens;
export type AtlasThemeName = 'light' | 'dark';
export type AtlasColorToken = { light: string; dark: string };
export default tokens;
`;
}

async function writeOutputs(tokens: Tokens): Promise<void> {
  const cssPath = resolve(packagesRoot, 'atlas-svelte/src/lib/styles/tokens.css');
  const tailwindPath = join(packageDir, 'tailwind.preset.cjs');
  const dtsPath = join(packageDir, 'tokens.d.ts');

  await mkdir(dirname(cssPath), { recursive: true });

  const css = createCss(tokens);
  const preset = createTailwindPreset(tokens);
  const dts = createDts(tokens);

  await Promise.all([
    writeFile(cssPath, `${css}\n`),
    writeFile(tailwindPath, preset),
    writeFile(dtsPath, dts)
  ]);
}

try {
  const tokens = await loadTokens();
  await writeOutputs(tokens);
  console.log('✔ Atlas tokens build complete.');
} catch (error) {
  console.error('✖ Failed to build Atlas tokens');
  if (error instanceof Error) {
    console.error(error.message);
  }
  process.exitCode = 1;
}

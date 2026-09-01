import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

/**
 * Raw Tailwind palette classes (`bg-red-500`) and arbitrary colour values
 * (`text-[#f00]`) are banned outright: every colour in this app has to come
 * from a semantic token declared in `src/app/globals.css`. That is what keeps
 * dark mode correct and what `scripts/check-contrast.mjs` is able to audit.
 */
const TAILWIND_PALETTE =
  '(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)';
const COLOUR_UTILITY =
  '(?:bg|text|border|ring|fill|stroke|from|via|to|decoration|outline|shadow|accent|caret|divide|placeholder)';

const rawPaletteClass = `\\b${COLOUR_UTILITY}-${TAILWIND_PALETTE}-\\d{2,3}\\b`;
// Note the deliberate omission of `color-mix`: `bg-[color-mix(in_oklch,var(--secondary),…)]`
// is derived entirely from tokens and is exactly what we want people to write.
// What is banned is a literal channel value that bypasses the token layer.
const arbitraryColour = `${COLOUR_UTILITY}-\\[(?:#|rgb|hsl|oklch\\()`;

const colourRule = [
  'error',
  {
    selector: `Literal[value=/${rawPaletteClass}/]`,
    message:
      'Raw Tailwind palette colour. Use a semantic token from globals.css (e.g. bg-status-failed, text-muted-foreground).',
  },
  {
    selector: `TemplateElement[value.raw=/${rawPaletteClass}/]`,
    message:
      'Raw Tailwind palette colour. Use a semantic token from globals.css.',
  },
  {
    selector: `Literal[value=/${arbitraryColour}/]`,
    message:
      'Arbitrary colour value. Declare a token in globals.css and reference that instead.',
  },
  {
    selector: `TemplateElement[value.raw=/${arbitraryColour}/]`,
    message:
      'Arbitrary colour value. Declare a token in globals.css and reference that instead.',
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'coverage/**',
    'next-env.d.ts',
  ]),

  {
    // Type-aware linting, applied only to our own source. We deliberately do
    // not pull in `recommendedTypeChecked` wholesale — its `no-unsafe-*` rules
    // are mostly noise against third-party types. These four are the ones that
    // catch real bugs in an app built around an async upload queue.
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-await': 'error',

      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      'no-restricted-syntax': colourRule,
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
    },
  },

  {
    // Vendored shadcn/ui primitives. We own the file but not the style; the
    // colour rule still applies, the rest does not.
    files: ['src/components/ui/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
    },
  },

  // Must stay last: turns off everything Prettier owns.
  prettier,
]);

export default eslintConfig;

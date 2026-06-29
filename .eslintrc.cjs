/* eslint-env node */
module.exports = {
  root: true,
  env: { browser: true, node: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'react', 'react-hooks', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
  ],
  settings: {
    react: { version: '18.3' },
    'import/resolver': {
      typescript: { project: ['tsconfig.json', 'tsconfig.web.json'] },
      node: true,
    },
  },
  rules: {
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/consistent-type-imports': 'error',
    'import/order': [
      'error',
      {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'always',
        alphabetize: { order: 'asc' },
      },
    ],
  },
  overrides: [
    // CRITICAL: core/ must not depend on react/electron/dom
    {
      files: ['src/core/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              { name: 'react', message: 'core/ must not import react (layer violation)' },
              { name: 'react-dom', message: 'core/ must not import react-dom (layer violation)' },
              { name: 'electron', message: 'core/ must not import electron (layer violation)' },
              { name: '@electron/*', message: 'core/ must not import electron (layer violation)' },
            ],
          },
        ],
      },
    },
    // shared/ same restriction
    {
      files: ['src/shared/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              { name: 'react', message: 'shared/ must not import react' },
              { name: 'react-dom', message: 'shared/ must not import react-dom' },
              { name: 'electron', message: 'shared/ must not import electron' },
            ],
          },
        ],
      },
    },
    // renderer/ may not import electron directly (must go through preload)
    {
      files: ['src/renderer/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: 'electron',
                message: 'renderer/ must not import electron directly (use preload bridge)',
              },
              // v1.16.0 — path-alias form of the same rule. Even
              // type-only imports across the layer boundary were
              // smuggling past the package-name check; ESLint's
              // `no-restricted-imports` only catches string matches,
              // and `@main/script/types` looked benign because the
              // string 'electron' isn't in the import. The architectural
              // invariant is "renderer reaches main only via preload" —
              // the alias is just a Vite resolution of that same
              // boundary. Migration target: types live in
              // `@shared/script/types` (renderer-allowed) so this rule
              // never fires for legitimate needs.
              {
                name: '@main',
                message:
                  'renderer/ must not import @main/* directly (use preload bridge for runtime, @shared/* for types)',
              },
            ],
          },
        ],
      },
    },
  ],
  ignorePatterns: ['dist/', 'node_modules/', 'coverage/', 'playwright-report/', 'vendor/'],
};

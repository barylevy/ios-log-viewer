import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'public/**'] },
  { files: ['**/*.ts', '**/*.tsx'], rules: { ...js.configs.recommended.rules } },
  ...tseslint.configs.recommended.map(config => ({ ...config, files: ['**/*.ts', '**/*.tsx'] })),
  {
    files: ['src/**/*.{ts,tsx,jsx}'],
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/rules-of-hooks': 'error' },
  },
  { files: ['**/*.ts', '**/*.tsx'], rules: { 'no-undef': 'off' } },
];

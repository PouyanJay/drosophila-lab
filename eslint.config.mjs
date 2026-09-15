import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'out/**',
    'dist/**',
    'coverage/**',
    'next-env.d.ts',
    '.sites-runtime/**',
    '.validation/**',
    '.local-data/**',
    'backups/**',
    '.venv/**',
    'public/**',
    'vendor/**',
  ]),
  {
    files: ['src/components/ui/**/*.{ts,tsx}', 'src/hooks/use-mobile.ts'],
    rules: {
      // Preserve the upstream shadcn registry code.
      '@typescript-eslint/no-unused-vars': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: [
      'src/features/**/*.{ts,tsx}',
      'src/components/**/*.{ts,tsx}',
      'src/hooks/**/*.ts',
      'src/lib/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/server/**', '**/server/**', '@/app/**', '**/app/**'],
              message:
                'Browser and shared modules must not import server services or route handlers.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/lib/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/server/**',
                '**/server/**',
                '@/features/**',
                '**/features/**',
                '@/app/**',
                '**/app/**',
                '@/components/**',
                '**/components/**',
                '@/hooks/**',
                '**/hooks/**',
              ],
              message:
                'Shared logic must not depend on server services, feature UI, hooks, or routes.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/server/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/**', '**/features/**', '@/app/**', '**/app/**'],
              message: 'Application logic must not depend on UI features or route entrypoints.',
            },
          ],
        },
      ],
    },
  },
]);

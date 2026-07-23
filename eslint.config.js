import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'functions']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^[A-Z_]',
        argsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
      // Downgraded to warn: setState in effect guard clauses (e.g. setLoading(false) on early
      // return) is a legitimate pattern used throughout this codebase for Firestore subscriptions.
      'react-hooks/set-state-in-effect': 'warn',
      // Downgraded to warn: context files intentionally export both the provider component and
      // hooks (e.g. RoadmapContext exports RoadmapProvider + useRoadmap). This is the standard
      // React context pattern and does not break fast refresh in practice.
      'react-refresh/only-export-components': 'warn',
    },
  },
  // CR-2 fix: block firebase-admin imports in client-side code.
  // firebase-admin bypasses all Firestore security rules — it must only
  // ever be used in server-side code (api/ or functions/).
  {
    files: ['src/**/*.{js,jsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'firebase-admin',
              message:
                "Do not import firebase-admin in client-side code (src/). " +
                "Use the regular Firebase SDK (firebase/firestore etc.) instead. " +
                "firebase-admin belongs in api/ or functions/ only.",
            },
          ],
          patterns: [
            {
              group: ['firebase-admin/*'],
              message:
                "Do not import firebase-admin in client-side code (src/). " +
                "firebase-admin belongs in api/ or functions/ only.",
            },
          ],
        },
      ],
    },
  },
  // Node.js globals for Vercel serverless API routes (api/ directory)
  {
    files: ['api/**/*.{js,cjs,mjs}'],
    languageOptions: {
      globals: globals.node,
    },
  },
])


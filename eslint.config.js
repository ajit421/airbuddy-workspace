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
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
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
])


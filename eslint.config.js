import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // shadcn/ui 组件导出 variants 是预期行为
      'react-refresh/only-export-components': ['warn', {
        allowExportNames: ['badgeVariants', 'buttonVariants', 'useSidebar'],
      }],
      // 允许在 effect 中同步外部状态到本地编辑状态（表单编辑场景）
      'react-hooks/set-state-in-effect': 'off',
    },
  },
])

// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  rules: {
    'vue/multi-word-component-names': 'off',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'vue/no-v-html': 'off',
    // Optional TS props are undefined by default; forcing defaults adds noise.
    'vue/require-default-prop': 'off',
  },
}, {
  ignores: ['server/db/migrations/**', 'playwright-report/**', 'test-results/**'],
})

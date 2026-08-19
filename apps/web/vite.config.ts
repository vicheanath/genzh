import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  css: {
    modules: {
      // Write kebab-case in CSS (the CSS convention) and read camelCase in TS
      // (the JS convention): `.track-indicator` becomes `styles.trackIndicator`.
      // `camelCaseOnly` drops the original kebab key rather than exposing both,
      // so there is exactly one way to reference a class.
      localsConvention: 'camelCaseOnly',

      // Readable class names in dev tooling (`Button__primary__a1b2c`) instead
      // of an opaque hash. The hash is still there, so scoping is unaffected.
      generateScopedName:
        process.env.NODE_ENV === 'production'
          ? '[hash:base64:8]'
          : '[name]__[local]__[hash:base64:5]',
    },
  },
})

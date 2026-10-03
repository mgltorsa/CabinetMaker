import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: ['.next/**', 'out/**', 'node_modules/**', '.claude/**', 'next-env.d.ts', 'playwright-report/**', 'test-results/**'] },
]

export default config

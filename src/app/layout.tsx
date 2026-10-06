import type { Metadata } from 'next'
import type { ReactNode } from 'react'
// Fonts are bundled from npm (no runtime font CDN in a static, offline-capable export).
import '@fontsource-variable/inter'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import './globals.css'

export const metadata: Metadata = {
  title: 'CabinetMaker',
  description: 'Parametric cabinet design, cut lists, nesting and CNC preview in the browser.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

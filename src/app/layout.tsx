import type { Metadata } from 'next'
import { Fraunces, Inter, Instrument_Sans, JetBrains_Mono } from 'next/font/google'
import { ThemeProvider, themeInitScript } from '@/components/theme/ThemeProvider'
import { QueryProvider } from '@/components/providers/QueryProvider'
import { ToastProvider } from '@/components/providers/ToastProvider'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

// Folio's code face (DESIGN_SYSTEM.md §5.1). Same family as before; only the
// CSS variable is renamed (Tailwind `font-mono` reads it).
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  fallback: ['ui-monospace', 'SFMono-Regular', 'monospace'],
})

// Folio display + text faces (change 011). Self-hosted by next/font (NFR-05).
// Inter stays the default sans until the cleanup (T13); migrated code opts in
// with Tailwind `font-display` / `font-text`.
const fraunces = Fraunces({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  // the optical-size axis: without it every "opsz" variation setting is ignored
  axes: ['opsz'],
  variable: '--font-display',
  display: 'swap',
  fallback: ['ui-serif', 'Georgia', 'serif'],
})

const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  fallback: ['ui-sans-serif', 'system-ui', 'sans-serif'],
})

export const metadata: Metadata = {
  title: 'bistec-studio',
  description: 'Marketing post generation tool for the Bistec team',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Anti-FOUC: apply saved theme before React hydrates */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} ${fraunces.variable} ${instrumentSans.variable} font-sans`}
      >
        <ThemeProvider>
          <QueryProvider>
            {children}
            <ToastProvider />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}

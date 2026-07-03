import type { Metadata } from 'next'
import Navbar from '@/components/Navbar'
import './globals.css'

export const metadata: Metadata = {
  title: 'michmos',
  description: 'Personal website',
}

const themeScript = `
  (function() {
    function applyTheme() {
      var theme = localStorage.getItem('theme');
      if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
    applyTheme();
    window.addEventListener('pageshow', applyTheme);
  })()
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">
        <Navbar />
        <main className="mx-auto max-w-4xl px-6 py-12">{children}</main>
      </body>
    </html>
  )
}

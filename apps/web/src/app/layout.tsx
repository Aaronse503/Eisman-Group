import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/components/theme-provider';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Eisman Holdings Command Center',
    template: '%s · Command Center',
  },
  description: 'Internal business operating system for Eisman Holdings.',
  robots: { index: false, follow: false, nocache: true },
  icons: {
    icon: [
      {
        url:
          'data:image/svg+xml,' +
          encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#06281a"/><text x="16" y="21" font-family="system-ui,sans-serif" font-size="13" font-weight="700" fill="#C8A951" text-anchor="middle">EH</text></svg>`,
          ),
        type: 'image/svg+xml',
      },
    ],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf8f3' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0e0d' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-[var(--accent)] focus:px-3 focus:py-2 focus:text-sm focus:text-[var(--accent-fg)]"
          >
            Skip to content
          </a>
          {children}
          <Toaster
            position="bottom-right"
            richColors
            closeButton
            toastOptions={{
              classNames: {
                toast:
                  'rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--fg)]',
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}

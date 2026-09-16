import type { NextConfig } from 'next';
import { join } from 'node:path';

/**
 * Security headers applied to every response. CSP is intentionally strict;
 * `unsafe-inline` for styles is required by Tailwind/Radix runtime style
 * injection, and `unsafe-eval` is dev-only (React Refresh).
 */
const isDev = process.env.NODE_ENV !== 'production';

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'" + (isDev ? ' ws: wss:' : ''),
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // The development server and a production build must not share a directory.
  // `next dev` rewrites the manifests in place, so a build that was made
  // earlier ends up serving a mixture of the two: the HTML references chunks
  // from one build and the files on disk are from the other. It fails as
  // "a client-side exception has occurred", which looks like an application
  // fault and is not one.
  distDir: isDev ? '.next-dev' : '.next',
  poweredByHeader: false,
  serverExternalPackages: ['@electric-sql/pglite', 'pg', 'pdfjs-dist'],

  // This is a workspace inside a monorepo, and the migrations live at the top
  // of it. Without both of these a serverless build ships the code without the
  // SQL, and the first request finds no schema to run against.
  outputFileTracingRoot: join(import.meta.dirname, '..', '..'),
  outputFileTracingIncludes: {
    '/**/*': ['../../db/migrations/**/*.sql'],
  },
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

export default nextConfig;

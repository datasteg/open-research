import path from 'node:path';
import type { NextConfig } from 'next';

const dev = process.env.NODE_ENV === 'development';

// A public site that loads nothing from another origin except the visitor count (an image request to stats.datasteg.com).
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://stats.datasteg.com",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');

const config: NextConfig = {
  output: 'standalone',
  // The design system lives one folder up (open-research/design), so the project root is open-research/.
  outputFileTracingRoot: path.join(__dirname, '..'),
  turbopack: { root: path.join(__dirname, '..') },
  // The atlas is read at run time from DATA_DIR (lib/db.ts), never bundled or traced.
  outputFileTracingExcludes: { '*': ['../data/**'] },
  serverExternalPackages: [],
  images: { unoptimized: true },
  poweredByHeader: false,
  // Organisations and Places became one map page (4 Nov 2026); their detail pages stay where they were.
  async redirects() {
    return [
      { source: '/:lang(en|ko)/o', destination: '/:lang/m?layer=org', permanent: true },
      { source: '/:lang(en|ko)/c', destination: '/:lang/m?layer=place&tab=place', permanent: true },
    ];
  },
  async headers() {
    return [
      {
        // Not indexed for now (robots.ts says the same).
        source: '/((?!_next/static).*)',
        headers: [
          { key: 'Content-Security-Policy', value: CSP },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ];
  },
  env: {
    APP_VERSION: process.env.APP_VERSION ?? 'dev',
    BUILD_TIME: process.env.BUILD_TIME ?? new Date().toISOString(),
  },
};

export default config;

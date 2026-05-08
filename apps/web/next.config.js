/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      urlPattern: /^https?.*\/_next\/static\/.*/,
      handler: 'CacheFirst',
      options: { cacheName: 'next-static', expiration: { maxAgeSeconds: 86400 * 30 } },
    },
    {
      // Match any cross-origin call into the NestJS API surface (path is /v1/*).
      urlPattern: /\/v1\/.*/,
      handler: 'NetworkFirst',
      method: 'GET',
      options: {
        cacheName: 'api-get',
        networkTimeoutSeconds: 4,
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
  ],
});

module.exports = withPWA({
  reactStrictMode: true,
  experimental: { typedRoutes: true },
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },
});

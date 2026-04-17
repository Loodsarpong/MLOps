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
      urlPattern: /^https?.*\/api\/.*GET$/,
      handler: 'NetworkFirst',
      options: { cacheName: 'api-get', networkTimeoutSeconds: 4 },
    },
  ],
});

module.exports = withPWA({
  reactStrictMode: true,
  experimental: { typedRoutes: true },
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },
});

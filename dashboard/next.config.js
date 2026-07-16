/** @type {import('next').NextConfig} */
// El panel nunca habla con la API por su URL pública: la proxea por /backend.
// Así el navegador ve un solo origen (sbc.infratec.com.uy) y no hay CORS ni
// certificados cruzados. En el contenedor el control-plane vive en :3100.
const API = process.env.API_URL || 'http://127.0.0.1:3100';

const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=()' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
];

const nextConfig = {
  reactStrictMode: true,
  skipTrailingSlashRedirect: true,   // socket.io usa /rt/ con barra final: no redirigir (rompe el handshake)
  output: 'standalone',   // la imagen final lleva sólo el bundle, no el árbol de node_modules
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
  async rewrites() {
    return [{ source: '/backend/:path*', destination: `${API}/:path*` }];
  },
};
module.exports = nextConfig;

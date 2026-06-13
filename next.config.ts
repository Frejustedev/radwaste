import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Racine de traçage des fichiers (plusieurs lockfiles détectés sur la machine).
  outputFileTracingRoot: process.cwd(),
  // Le lint et le typage NE SONT PLUS ignorés au build : la CI doit échouer sur une erreur.
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  output: 'standalone',
};

export default nextConfig;

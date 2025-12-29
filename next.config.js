// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['simple-git']
  }
};

export default nextConfig;

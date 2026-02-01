// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['simple-git']
  }
};

export default nextConfig;

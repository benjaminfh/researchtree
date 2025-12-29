// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './src/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '"Helvetica Neue"', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      colors: {
        primary: '#1a73e8',
        rail: '#eef3ff',
        surface: '#ffffff',
        text: '#1f2937',
        muted: '#6b7280',
        divider: '#e5e7eb'
      },
      borderRadius: {
        md: '12px',
        lg: '16px',
        xl: '18px'
      },
      boxShadow: {
        card: '0 10px 30px rgba(15,23,42,0.08)',
        composer: '0 16px 40px rgba(15,23,42,0.12)'
      }
    }
  },
  plugins: [typography]
};

export default config;

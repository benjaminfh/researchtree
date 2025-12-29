// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

module.exports = {
  packagerConfig: {
    asar: true,
    icon: 'desktop/assets/threds',
    extraResource: ['.next/standalone', '.next/static', 'supabase/migrations'],
    ignore: [
      '^/\\.env($|\\.)',
      '^/API_DOCS($|/)',
      '^/PM_DOCS($|/)',
      '^/tests($|/)',
      '^/node_modules($|/)',
      '^/out($|/)',
      '^/\\.git($|/)',
      '^/\\.github($|/)',
      '^/\\.DS_Store$',
      '^/\\.next(?!/(standalone|static))',
      '^/\\.test-projects($|/)',
      '^/tsconfig\\.tsbuildinfo$',
      '^/supabase/\\.temp($|/)',
      '^/supabase/migrations_legacy($|/)',
      '^/README\\.md$',
      '^/CLAUDE\\.md$',
      '^/AGENTS\\.md$',
      '^/systemprompt\\.md$'
    ]
  },
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin']
    },
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin']
    }
  ]
};

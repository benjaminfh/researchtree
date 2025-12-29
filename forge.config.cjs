module.exports = {
  packagerConfig: {
    asar: true,
    icon: 'desktop/assets/threds',
    extraResource: ['.next/standalone', '.next/static', 'supabase/migrations']
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

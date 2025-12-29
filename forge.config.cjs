module.exports = {
  packagerConfig: {
    asar: false,
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

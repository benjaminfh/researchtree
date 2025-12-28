const form = document.getElementById('config-form');
const input = document.getElementById('pg-url');
const errorEl = document.getElementById('error');

async function loadConfig() {
  try {
    const config = await window.desktopApi.readConfig();
    if (config && config.LOCAL_PG_URL) {
      input.value = config.LOCAL_PG_URL;
    }
  } catch (error) {
    errorEl.hidden = false;
    errorEl.textContent = 'Failed to read config.';
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorEl.hidden = true;
  const value = input.value.trim();
  if (!value) {
    errorEl.hidden = false;
    errorEl.textContent = 'Please enter a connection string.';
    return;
  }
  try {
    await window.desktopApi.saveConfig({ LOCAL_PG_URL: value });
  } catch (error) {
    errorEl.hidden = false;
    errorEl.textContent = 'Failed to save config.';
  }
});

loadConfig();

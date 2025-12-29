// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

const form = document.getElementById('config-form');
const input = document.getElementById('pg-url');
const errorEl = document.getElementById('error');

function showError(message) {
  errorEl.hidden = false;
  errorEl.textContent = message;
}

async function loadConfig() {
  if (!window.desktopApi || typeof window.desktopApi.readConfig !== 'function') {
    showError('Desktop API unavailable. Restart the app.');
    return;
  }
  try {
    if (typeof window.desktopApi.getAppName === 'function') {
      const name = await window.desktopApi.getAppName();
      if (name) {
        document.title = `${name} Setup`;
      }
    }
    const config = await window.desktopApi.readConfig();
    if (config && config.LOCAL_PG_URL) {
      input.value = config.LOCAL_PG_URL;
    } else {
      input.value = 'postgresql://localhost:5432/postgres';
    }
  } catch (error) {
    showError('Failed to read config.');
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorEl.hidden = true;
  const value = input.value.trim();
  if (!value) {
    showError('Please enter a connection string.');
    return;
  }
  try {
    if (!window.desktopApi || typeof window.desktopApi.saveConfig !== 'function') {
      showError('Desktop API unavailable. Restart the app.');
      return;
    }
    await window.desktopApi.saveConfig({ LOCAL_PG_URL: value });
  } catch (error) {
    showError('Failed to save config.');
  }
});

window.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  input.focus();
});

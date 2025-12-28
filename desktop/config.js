import fs from 'node:fs/promises';
import path from 'node:path';

const CONFIG_FILE = 'config.json';

export function getConfigPath(userDataPath) {
  return path.join(userDataPath, CONFIG_FILE);
}

export async function readConfig(userDataPath) {
  const filePath = getConfigPath(userDataPath);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

export async function writeConfig(userDataPath, config) {
  const filePath = getConfigPath(userDataPath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(config, null, 2));
}

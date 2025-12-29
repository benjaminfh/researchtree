import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const target = process.argv[2] ?? 'make';
const allowedTargets = new Set(['make', 'package']);

if (!allowedTargets.has(target)) {
  console.error('Usage: node scripts/desktop-package.js <make|package>');
  process.exit(1);
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function copyDir(source, destination) {
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.cp(source, destination, { recursive: true });
}

async function ensureStandaloneAssets() {
  const root = process.cwd();
  const standaloneRoot = path.join(root, '.next', 'standalone');
  const staticRoot = path.join(root, '.next', 'static');
  const publicRoot = path.join(root, 'public');

  try {
    await fs.access(standaloneRoot);
  } catch {
    throw new Error('Missing .next/standalone output. Run the Next.js build first.');
  }

  await copyDir(staticRoot, path.join(standaloneRoot, '.next', 'static'));

  try {
    await fs.access(publicRoot);
    await copyDir(publicRoot, path.join(standaloneRoot, 'public'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return;
    }
    throw error;
  }
}

async function main() {
  await runCommand('npm', ['run', 'build'], {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }
  });
  await ensureStandaloneAssets();
  await runCommand('npx', ['electron-forge', target]);
}

main().catch((error) => {
  console.error('[desktop:package]', error instanceof Error ? error.message : error);
  process.exit(1);
});

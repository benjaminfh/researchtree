// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const RPC_CONFIG_FILE = path.join(ROOT, 'src/store/pg/localAdapter.ts');
const RPC_SCAN_ROOT = path.join(ROOT, 'src/store/pg');
const TARGET_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

async function gatherFiles(entry) {
  const stat = await fs.stat(entry);
  if (stat.isFile()) {
    return [entry];
  }
  if (!stat.isDirectory()) return [];
  const entries = await fs.readdir(entry);
  const results = [];
  for (const name of entries) {
    results.push(...(await gatherFiles(path.join(entry, name))));
  }
  return results;
}

function isTargetFile(filePath) {
  return TARGET_EXTENSIONS.has(path.extname(filePath));
}

function extractRpcConfigNames(contents) {
  const names = new Set();
  const regex = /\b(rt_[a-z0-9_]+)\s*:/g;
  let match;
  while ((match = regex.exec(contents)) !== null) {
    names.add(match[1]);
  }
  return names;
}

function extractRpcCalls(contents) {
  const names = new Set();
  const regex = /\b(?:adminRpc|rpc)\(\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = regex.exec(contents)) !== null) {
    names.add(match[1]);
  }
  return names;
}

async function main() {
  const configContents = await fs.readFile(RPC_CONFIG_FILE, 'utf8');
  const configNames = extractRpcConfigNames(configContents);

  const files = (await gatherFiles(RPC_SCAN_ROOT)).filter(isTargetFile);
  const rpcCalls = new Set();
  for (const filePath of files) {
    const contents = await fs.readFile(filePath, 'utf8');
    for (const name of extractRpcCalls(contents)) {
      rpcCalls.add(name);
    }
  }

  const missing = [...rpcCalls].filter((name) => !configNames.has(name));
  if (missing.length > 0) {
    console.error('Local PG adapter RPC config missing for:');
    for (const name of missing.sort()) {
      console.error(`- ${name}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Local PG RPC config check failed:', error);
  process.exit(1);
});

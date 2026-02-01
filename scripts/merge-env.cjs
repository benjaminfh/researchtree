#!/usr/bin/env node
// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const args = { base: 'env.local', out: 'env.local.merged', from: null };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--base') {
      args.base = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === '--out') {
      args.out = argv[i + 1];
      i += 1;
      continue;
    }
    if (!args.from && !token.startsWith('-')) {
      args.from = token;
      continue;
    }
    if (token === '--help' || token === '-h') {
      return { help: true };
    }
  }
  return args;
}

function parseEnvLine(line) {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (!match) return null;
  return { key: match[1], value: match[2] ?? '' };
}

function readLines(filePath) {
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
}

function writeLines(filePath, lines) {
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.from) {
    console.log(
      [
        'Usage:',
        '  node scripts/merge-env.cjs <from-env> [--base env.local] [--out env.local.merged]',
        '',
        'Description:',
        '  Copies env.local and overwrites matching keys with values from <from-env>.',
        '  New keys are appended at the end.'
      ].join('\n')
    );
    process.exit(args.help ? 0 : 1);
  }

  const basePath = path.resolve(args.base);
  const fromPath = path.resolve(args.from);
  const outPath = path.resolve(args.out);

  if (!fs.existsSync(basePath)) {
    console.error(`Base env file not found: ${basePath}`);
    process.exit(1);
  }
  if (!fs.existsSync(fromPath)) {
    console.error(`Source env file not found: ${fromPath}`);
    process.exit(1);
  }

  const baseLines = readLines(basePath);
  const fromLines = readLines(fromPath);

  const baseIndexByKey = new Map();
  baseLines.forEach((line, index) => {
    const parsed = parseEnvLine(line);
    if (!parsed) return;
    baseIndexByKey.set(parsed.key, index);
  });

  const appended = [];
  fromLines.forEach((line) => {
    const parsed = parseEnvLine(line);
    if (!parsed) return;
    const idx = baseIndexByKey.get(parsed.key);
    if (typeof idx === 'number') {
      baseLines[idx] = `${parsed.key}=${parsed.value}`;
    } else {
      appended.push(`${parsed.key}=${parsed.value}`);
    }
  });

  if (appended.length > 0) {
    baseLines.push('', '# Added from merge source', ...appended);
  }

  writeLines(outPath, baseLines);
  console.log(`Wrote merged env to ${outPath}`);
}

main();

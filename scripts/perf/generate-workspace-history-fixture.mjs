#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const allowedCounts = new Set([1000, 5000, 10000]);
const count = Number.parseInt(process.argv[2] ?? '', 10);
if (!allowedCounts.has(count)) {
  console.error('Usage: node scripts/perf/generate-workspace-history-fixture.mjs <1000|5000|10000>');
  process.exit(1);
}

const branchName = 'main';
const nodes = [];
let parent = null;
for (let index = 0; index < count; index += 1) {
  const isUser = index % 2 === 0;
  const id = `perf-node-${String(index + 1).padStart(5, '0')}`;
  nodes.push({
    id,
    type: 'message',
    role: isUser ? 'user' : 'assistant',
    content: isUser ? `Perf fixture user message ${index + 1}` : `Perf fixture assistant response ${index + 1}`,
    timestamp: 1700000000000 + index,
    parent,
    createdOnBranch: branchName
  });
  parent = id;
}

const outDir = path.resolve('tmp/perf-fixtures');
await mkdir(outDir, { recursive: true });
const outFile = path.join(outDir, `workspace-history-${count}.json`);
await writeFile(outFile, JSON.stringify({ branchName, nodes }, null, 2));
console.log(outFile);

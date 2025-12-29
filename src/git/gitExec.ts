// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { spawn } from 'node:child_process';

export async function gitExec(
  cwd: string,
  args: string[],
  options?: { input?: string; env?: Record<string, string | undefined> }
): Promise<string> {
  const env = options?.env ? { ...process.env, ...options.env } : process.env;
  const maxBuffer = 50 * 1024 * 1024;

  return await new Promise<string>((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    const onChunk = (current: string, chunk: string) => {
      const next = current + chunk;
      if (next.length > maxBuffer) {
        child.kill('SIGKILL');
        reject(new Error(`git ${args.join(' ')} failed: output exceeded ${maxBuffer} bytes`));
        return null;
      }
      return next;
    };

    child.stdout.on('data', (chunk) => {
      const next = onChunk(stdout, chunk);
      if (next !== null) stdout = next;
    });
    child.stderr.on('data', (chunk) => {
      const next = onChunk(stderr, chunk);
      if (next !== null) stderr = next;
    });

    child.on('error', (error) => {
      reject(new Error(`git ${args.join(' ')} failed: ${error.message}`));
    });

    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      const hint = stderr.trim() || stdout.trim() || `exit code ${code ?? 'unknown'}${signal ? ` (${signal})` : ''}`;
      reject(new Error(`git ${args.join(' ')} failed: ${hint}`));
    });

    if (typeof options?.input === 'string' && options.input.length > 0) {
      child.stdin.write(options.input);
    }
    child.stdin.end();
  });
}

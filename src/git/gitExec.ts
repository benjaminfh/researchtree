import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function gitExec(
  cwd: string,
  args: string[],
  options?: { input?: string; env?: Record<string, string | undefined> }
): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
      input: options?.input,
      env: options?.env ? { ...process.env, ...options.env } : process.env
    });
    return stdout.toString();
  } catch (error) {
    const err = error as any;
    const stderr = typeof err?.stderr === 'string' ? err.stderr.trim() : '';
    const stdout = typeof err?.stdout === 'string' ? err.stdout.trim() : '';
    const hint = stderr || stdout || (err?.message ?? 'Unknown git error');
    throw new Error(`git ${args.join(' ')} failed: ${hint}`);
  }
}


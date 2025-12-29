import { getStoreConfig } from '@/src/server/storeConfig';

export type CanvasToolName = 'canvas_grep' | 'canvas_read_lines' | 'canvas_read_all' | 'canvas_apply_patch';

export interface CanvasToolResult {
  ok: boolean;
  result?: unknown;
  error?: string;
}

const canvasToolsSchema = {
  canvas_grep: {
    name: 'canvas_grep',
    description: 'Search the canvas for a query and return matching line numbers.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string', description: 'Text or /regex/flags to search for.' }
      },
      required: ['query']
    }
  },
  canvas_read_lines: {
    name: 'canvas_read_lines',
    description: 'Read a range of lines from the canvas (1-based, inclusive).',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        start_line: { type: 'integer', minimum: 1 },
        end_line: { type: 'integer', minimum: 1 }
      },
      required: ['start_line', 'end_line']
    }
  },
  canvas_read_all: {
    name: 'canvas_read_all',
    description: 'Read the entire canvas.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {}
    }
  },
  canvas_apply_patch: {
    name: 'canvas_apply_patch',
    description: 'Apply a unified diff patch to the canvas. All hunks must apply cleanly.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        patch: { type: 'string', description: 'Unified diff patch.' }
      },
      required: ['patch']
    }
  }
} as const;

export function getCanvasToolsForOpenAIChat() {
  return Object.values(canvasToolsSchema).map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }));
}

export function getCanvasToolsForOpenAIResponses() {
  return Object.values(canvasToolsSchema).map((tool) => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters
  }));
}

export function getCanvasToolsForAnthropic() {
  return Object.values(canvasToolsSchema).map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters
  }));
}

export function getCanvasToolsForGemini() {
  return [
    {
      functionDeclarations: Object.values(canvasToolsSchema).map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: stripAdditionalProperties(tool.parameters)
      }))
    }
  ];
}

function stripAdditionalProperties<T extends Record<string, unknown>>(schema: T): T {
  if (!schema || typeof schema !== 'object') return schema;
  const copy: Record<string, unknown> = { ...schema };
  if ('additionalProperties' in copy) {
    delete copy.additionalProperties;
  }
  return copy as T;
}

function parseQuery(query: string): RegExp | null {
  if (!query) return null;
  if (query.startsWith('/') && query.lastIndexOf('/') > 0) {
    const lastSlash = query.lastIndexOf('/');
    const pattern = query.slice(1, lastSlash);
    const flags = query.slice(lastSlash + 1);
    try {
      return new RegExp(pattern, flags);
    } catch {
      return null;
    }
  }
  try {
    return new RegExp(escapeRegExp(query), 'g');
  } catch {
    return null;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitLines(text: string): string[] {
  return text.split('\n');
}

function applyUnifiedDiff(content: string, patch: string): { ok: boolean; text?: string; appliedHunks?: number; error?: string } {
  const lines = splitLines(content);
  const diffLines = patch.split('\n');
  let offset = 0;
  let applied = 0;
  let i = 0;

  while (i < diffLines.length) {
    const line = diffLines[i];
    if (!line.startsWith('@@')) {
      i += 1;
      continue;
    }

    const match = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/.exec(line);
    if (!match) {
      return { ok: false, error: `Invalid hunk header: ${line}` };
    }
    const oldStart = Number(match[1]);
    if (!Number.isFinite(oldStart) || oldStart < 1) {
      return { ok: false, error: `Invalid hunk start: ${line}` };
    }

    let idx = oldStart - 1 + offset;
    i += 1;

    while (i < diffLines.length && !diffLines[i].startsWith('@@')) {
      const hunkLine = diffLines[i];
      if (hunkLine.startsWith('\\')) {
        i += 1;
        continue;
      }
      const prefix = hunkLine[0];
      const text = hunkLine.slice(1);

      if (prefix === ' ') {
        if (lines[idx] !== text) {
          return { ok: false, error: `Context mismatch at line ${idx + 1}` };
        }
        idx += 1;
      } else if (prefix === '-') {
        if (lines[idx] !== text) {
          return { ok: false, error: `Removal mismatch at line ${idx + 1}` };
        }
        lines.splice(idx, 1);
        offset -= 1;
      } else if (prefix === '+') {
        lines.splice(idx, 0, text);
        idx += 1;
        offset += 1;
      } else {
        return { ok: false, error: `Invalid hunk line: ${hunkLine}` };
      }
      i += 1;
    }
    applied += 1;
  }

  return { ok: true, text: lines.join('\n'), appliedHunks: applied };
}

export async function executeCanvasTool(options: {
  tool: CanvasToolName;
  args: Record<string, unknown>;
  projectId: string;
  refName: string;
}): Promise<CanvasToolResult> {
  const store = getStoreConfig();
  if (store.mode !== 'pg') {
    return { ok: false, error: 'Canvas tools are only available in PG mode.' };
  }

  const { rtGetCanvasShadowV1 } = await import('@/src/store/pg/reads');
  const { rtSaveArtefactDraft } = await import('@/src/store/pg/drafts');

  const canvas = await rtGetCanvasShadowV1({ projectId: options.projectId, refName: options.refName });
  const lines = splitLines(canvas.content ?? '');

  if (options.tool === 'canvas_grep') {
    const query = String(options.args.query ?? '');
    const regex = parseQuery(query);
    if (!regex) {
      return { ok: false, error: 'Invalid query or regex.' };
    }
    const matches = lines
      .map((text, index) => ({ line: index + 1, text }))
      .filter((entry) => {
        regex.lastIndex = 0;
        return regex.test(entry.text);
      })
      .map((entry) => ({ line: entry.line, text: entry.text }));
    return {
      ok: true,
      result: {
        matches,
        revision_id: canvas.contentHash ?? ''
      }
    };
  }

  if (options.tool === 'canvas_read_lines') {
    const startLine = Number(options.args.start_line ?? 0);
    const endLine = Number(options.args.end_line ?? 0);
    if (!Number.isFinite(startLine) || !Number.isFinite(endLine) || startLine < 1 || endLine < startLine) {
      return { ok: false, error: 'Invalid line range.' };
    }
    const startIndex = startLine - 1;
    const endIndex = Math.min(endLine, lines.length);
    const slice = lines.slice(startIndex, endIndex).join('\n');
    return {
      ok: true,
      result: {
        text: slice,
        start_line: startLine,
        end_line: endLine,
        revision_id: canvas.contentHash ?? ''
      }
    };
  }

  if (options.tool === 'canvas_read_all') {
    return {
      ok: true,
      result: {
        text: canvas.content ?? '',
        revision_id: canvas.contentHash ?? ''
      }
    };
  }

  if (options.tool === 'canvas_apply_patch') {
    const patch = String(options.args.patch ?? '');
    const applied = applyUnifiedDiff(canvas.content ?? '', patch);
    if (!applied.ok || applied.text == null) {
      return { ok: false, error: applied.error ?? 'Patch rejected.' };
    }
    const saved = await rtSaveArtefactDraft({
      projectId: options.projectId,
      refName: options.refName,
      content: applied.text
    });
    return {
      ok: true,
      result: {
        applied_hunks: applied.appliedHunks ?? 0,
        new_revision_id: saved.contentHash
      }
    };
  }

  return { ok: false, error: 'Unknown tool.' };
}

// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

export type UserSystemPromptMode = 'append' | 'replace';

export interface UserSystemPromptSettings {
  mode: UserSystemPromptMode;
  prompt: string | null;
}

export function buildDefaultSystemPrompt(canvasToolsEnabled: boolean): string {
  const base = [
    'You are an insightful, encouraging assistant who combines meticulous clarity with genuine enthusiasm and gentle humor.',
    'Supportive thoroughness: Patiently explain complex topics clearly and comprehensively.',
    'Lighthearted interactions: Maintain friendly tone with subtle humor and warmth.',
    'Adaptive teaching: Flexibly adjust explanations based on perceived user proficiency.',
    'Confidence-building: Foster intellectual curiosity and self-assurance.',
    'Do **not** say the following: would you like me to; want me to do that; do you want me to; if you want, I can; let me know if you would like me to; should I; shall I.',
    'Ask at most one necessary clarifying question at the start, not the end.',
    'If the next step is obvious, do it. Example of bad: I can write playful examples. would you like me to? Example of good: Here are three playful examples:..'
  ];

  const canvasSection = canvasToolsEnabled
    ? [
        'Canvas tools are available: canvas_grep, canvas_read_lines, canvas_read_all, canvas_apply_patch.',
        'Canvas tools require: locate -> inspect -> edit. Never retype target text from memory.',
        'Line indices are 1-based. Patches must be unified diff format and apply cleanly.'
      ]
    : [
        'Canvas tools may not be available in this conversation. If tools are absent, respond using provided context without referencing tool-only actions.'
      ];

  const sharedCanvasState = ['Some user messages are hidden canvas updates; treat them as authoritative canvas changes.'];
  return [...base, ...canvasSection, ...sharedCanvasState].join('\n');
}

export function resolveSystemPrompt({
  defaultPrompt,
  settings
}: {
  defaultPrompt: string;
  settings: UserSystemPromptSettings | null;
}): string {
  const customPrompt = settings?.prompt?.trim() ?? '';
  if (!customPrompt) {
    return defaultPrompt;
  }

  if (settings?.mode === 'replace') {
    return customPrompt;
  }

  return `${defaultPrompt}\n\n${customPrompt}`;
}


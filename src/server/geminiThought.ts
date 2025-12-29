// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

export function isGeminiThoughtPart(part: any): boolean {
  const value = part?.thought;
  if (value === true) return true;
  if (value === false || value == null) return false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized || normalized === 'false' || normalized === '0' || normalized === 'no') return false;
    return true;
  }
  if (typeof value === 'number') return value !== 0;
  return typeof value === 'object';
}

export function getGeminiPartText(part: any): string {
  if (typeof part?.text === 'string') return part.text;
  if (typeof part?.thought === 'string') return part.thought;
  return '';
}

export function extractGeminiTextData(source: any): { text: string; hasParts: boolean } {
  const candidates = Array.isArray(source?.candidates) ? source.candidates : [];
  const parts = Array.isArray(candidates[0]?.content?.parts) ? candidates[0].content.parts : null;
  if (!parts) {
    return { text: '', hasParts: false };
  }
  let text = '';
  for (const part of parts) {
    const partText = getGeminiPartText(part);
    if (partText && !isGeminiThoughtPart(part)) {
      text += partText;
    }
  }
  return { text, hasParts: true };
}

export function extractGeminiThoughtData(source: any): { thoughtText: string; signature: string; hasParts: boolean } {
  const candidates = Array.isArray(source?.candidates) ? source.candidates : [];
  const parts = Array.isArray(candidates[0]?.content?.parts) ? candidates[0].content.parts : null;
  if (!parts) {
    return { thoughtText: '', signature: '', hasParts: false };
  }
  let thoughtText = '';
  let signature = '';
  for (const part of parts) {
    if (isGeminiThoughtPart(part)) {
      const partText = getGeminiPartText(part);
      if (partText) {
        thoughtText += partText;
      }
    }
    if (typeof part?.thoughtSignature === 'string') {
      signature = String(part.thoughtSignature);
    }
  }
  return { thoughtText, signature, hasParts: true };
}

export function getGeminiDelta(next: string, previous: string): { delta: string; updated: string } {
  if (!next) return { delta: '', updated: previous };
  if (next.startsWith(previous)) {
    return { delta: next.slice(previous.length), updated: next };
  }
  return { delta: next, updated: previous + next };
}

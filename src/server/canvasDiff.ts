export function buildUnifiedDiff(oldText: string, newText: string, options?: { contextLines?: number }): string {
  if (oldText === newText) return '';
  const context = options?.contextLines ?? 3;
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  let start = 0;
  const minLen = Math.min(oldLines.length, newLines.length);
  while (start < minLen && oldLines[start] === newLines[start]) {
    start += 1;
  }

  let endOld = oldLines.length - 1;
  let endNew = newLines.length - 1;
  while (endOld >= start && endNew >= start && oldLines[endOld] === newLines[endNew]) {
    endOld -= 1;
    endNew -= 1;
  }

  if (start > endOld && start > endNew) {
    return '';
  }

  const hunkStartOld = Math.max(0, start - context);
  const hunkStartNew = Math.max(0, start - context);
  const hunkEndOld = Math.min(oldLines.length, endOld + 1 + context);
  const hunkEndNew = Math.min(newLines.length, endNew + 1 + context);

  const oldCount = hunkEndOld - hunkStartOld;
  const newCount = hunkEndNew - hunkStartNew;

  const hunkLines: string[] = [];

  for (let i = hunkStartOld; i < start && i < oldLines.length; i += 1) {
    hunkLines.push(` ${oldLines[i]}`);
  }

  for (let i = start; i <= endOld && i < oldLines.length; i += 1) {
    hunkLines.push(`-${oldLines[i]}`);
  }

  for (let i = start; i <= endNew && i < newLines.length; i += 1) {
    hunkLines.push(`+${newLines[i]}`);
  }

  for (let i = endOld + 1; i < hunkEndOld && i < oldLines.length; i += 1) {
    hunkLines.push(` ${oldLines[i]}`);
  }

  return ['--- a/canvas.md', '+++ b/canvas.md', `@@ -${hunkStartOld + 1},${oldCount} +${hunkStartNew + 1},${newCount} @@`, ...hunkLines].join(
    '\n'
  );
}

// Compare diagnostic identities without line numbers or absolute worktree paths.
// Usage: node scripts/compare_reforma_baseline.mjs lint old.json new.json
//        node scripts/compare_reforma_baseline.mjs tsc old.log new.log
import fs from 'node:fs';

const [mode, beforePath, afterPath] = process.argv.slice(2);
if (!['lint', 'tsc'].includes(mode) || !beforePath || !afterPath) {
  throw new Error('Expected mode lint|tsc and two log paths');
}
const read = path => fs.readFileSync(path, 'utf8');
const file = path => path.replaceAll('\\', '/').replace(/^.*?(?=src\/|supabase\/)/, '');
const count = entries => {
  const result = new Map();
  for (const entry of entries) result.set(entry, (result.get(entry) ?? 0) + 1);
  return result;
};
const subtract = (left, right) => [...left].flatMap(([key, n]) =>
  Array(Math.max(0, n - (right.get(key) ?? 0))).fill(key));

let before;
let after;
if (mode === 'lint') {
  const oldRows = JSON.parse(read(beforePath));
  const newRows = JSON.parse(read(afterPath));
  const touched = new Set(newRows.map(row => file(row.filePath)));
  const identity = row => row.messages.map(message =>
    `${file(row.filePath)}|${message.ruleId ?? 'parser'}|${message.severity}|${message.message.replace(/at line \d+/g, 'at line #')}`);
  before = oldRows.filter(row => touched.has(file(row.filePath))).flatMap(identity);
  after = newRows.flatMap(identity);
} else {
  const identity = text => text.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^(.+?)\(\d+,\d+\): error (TS\d+): (.+)$/);
    if (!match) return [];
    const message = match[3];
    const quoted = message.match(/(?:Property|Argument of type|and) '([^']+)'/);
    const detail = quoted ? quoted[1] : message.split(/\.|:/, 1)[0];
    return [`${file(match[1])}|${match[2]}|${detail}`];
  });
  before = identity(read(beforePath));
  after = identity(read(afterPath));
}
const added = subtract(count(after), count(before));
const removed = subtract(count(before), count(after));
console.log(JSON.stringify({ mode, baseline: before.length, current: after.length,
  added, removedCount: removed.length, removedPreview: removed.slice(0, 5) }, null, 2));
if (added.length) process.exitCode = 1;

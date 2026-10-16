// Compares the published text of an article with its pending edit, for the
// review page. Returns the parts in reading order: { type, text } where type is
// 'same', 'del' (only in the published version, shown in red) or 'ins' (only
// in the edit, shown in green).

const LINES = /[^\n]*\n|[^\n]+/g;
const WORDS = /\s+|\S+/g;
// Above this many table cells a block is shown as fully replaced, so a huge
// rewrite cannot slow the server down.
const MAX_CELLS = 2000000;

function split(text, pattern) {
  return String(text ?? '').match(pattern) || [];
}

function add(ops, type, tokens) {
  for (const text of tokens) ops.push({ type, text });
}

// Longest common subsequence: keeps as many tokens unchanged as possible.
function compare(a, b) {
  let start = 0, endA = a.length, endB = b.length;
  while (start < endA && start < endB && a[start] === b[start]) start++;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const ops = [];
  add(ops, 'same', a.slice(0, start));
  const n = endA - start, m = endB - start;
  if (n * m > MAX_CELLS) {
    add(ops, 'del', a.slice(start, endA));
    add(ops, 'ins', b.slice(start, endB));
  } else {
    // lcs[i * (m + 1) + j] = length of the LCS of a[start + i..] and b[start + j..]
    const lcs = new Uint32Array((n + 1) * (m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i * (m + 1) + j] = a[start + i] === b[start + j]
          ? lcs[(i + 1) * (m + 1) + j + 1] + 1
          : Math.max(lcs[(i + 1) * (m + 1) + j], lcs[i * (m + 1) + j + 1]);
      }
    }
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a[start + i] === b[start + j]) {
        ops.push({ type: 'same', text: a[start + i] }); i++; j++;
      } else if (j === m || (i < n && lcs[(i + 1) * (m + 1) + j] >= lcs[i * (m + 1) + j + 1])) {
        ops.push({ type: 'del', text: a[start + i] }); i++;
      } else {
        ops.push({ type: 'ins', text: b[start + j] }); j++;
      }
    }
  }
  add(ops, 'same', a.slice(endA));
  return ops;
}

// Joins neighbouring parts of the same type into one.
function append(parts, { type, text }) {
  const last = parts[parts.length - 1];
  if (last && last.type === type) last.text += text;
  else parts.push({ type, text });
}

// Compares line by line first, so long articles stay fast, then word by word
// inside each run of changed lines.
function diffWords(oldText, newText) {
  const parts = [];
  const lines = compare(split(oldText, LINES), split(newText, LINES));
  for (let i = 0; i < lines.length;) {
    if (lines[i].type === 'same') {
      append(parts, lines[i++]);
      continue;
    }
    let removed = '', added = '';
    for (; i < lines.length && lines[i].type !== 'same'; i++) {
      if (lines[i].type === 'del') removed += lines[i].text;
      else added += lines[i].text;
    }
    for (const op of compare(split(removed, WORDS), split(added, WORDS))) append(parts, op);
  }
  return parts;
}

module.exports = { diffWords };

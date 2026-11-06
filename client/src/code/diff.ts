// A small line + word diff for showing what a fix changed (debug practice). No dependency: the code is at most a
// few hundred lines, so a plain LCS table is fast enough.

export interface DiffPart {
  text: string;
  // True for the words that differ inside a changed line.
  changed: boolean;
}

export interface DiffRow {
  kind: "same" | "add" | "del";
  // Line numbers in the old and new code (null on the side the line doesn't exist).
  oldNo: number | null;
  newNo: number | null;
  parts: DiffPart[];
}

// Lines are matched ignoring how whitespace is laid out, so a re-indented line doesn't count as a change.
const lineKey = (line: string) => line.replace(/\s+/g, " ").trim();

// The longest common subsequence of a and b (by key), as pairs of matching indexes.
function lcs<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean): [number, number][] {
  const n = a.length;
  const m = b.length;
  const table: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = eq(a[i], b[j]) ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (eq(a[i], b[j])) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

// Words, numbers, runs of whitespace, and operators/punctuation (multi-character operators kept whole).
const TOKEN = /\s+|[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|===|!==|==|!=|<=|>=|=>|->|\*\*|\/\/|&&|\|\||\?\?|\+\+|--|[+\-*/%]=|::|\.\.\.|[^\sA-Za-z0-9_$]/g;
const tokens = (line: string) => line.match(TOKEN) ?? [];

// Marks the tokens of `line` that aren't in the common subsequence with `other`. Whitespace never counts as a change.
function wordParts(line: string, other: string): { a: DiffPart[]; b: DiffPart[] } {
  const ta = tokens(line);
  const tb = tokens(other);
  const pairs = lcs(ta, tb, (x, y) => x === y || (/^\s+$/.test(x) && /^\s+$/.test(y)));
  const keptA = new Set(pairs.map((p) => p[0]));
  const keptB = new Set(pairs.map((p) => p[1]));
  const merge = (list: string[], kept: Set<number>): DiffPart[] => {
    const parts: DiffPart[] = [];
    list.forEach((text, i) => {
      const changed = !kept.has(i) && !/^\s+$/.test(text);
      const last = parts[parts.length - 1];
      if (last && last.changed === changed) last.text += text;
      else parts.push({ text, changed });
    });
    return parts;
  };
  return { a: merge(ta, keptA), b: merge(tb, keptB) };
}

const whole = (text: string): DiffPart[] => [{ text, changed: false }];

export function diffLines(oldText: string, newText: string): DiffRow[] {
  const oldLines = oldText.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  const newLines = newText.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  const oldKeys = oldLines.map(lineKey);
  const newKeys = newLines.map(lineKey);
  const pairs = lcs(
    oldKeys.map((_, i) => i),
    newKeys.map((_, j) => j),
    (i, j) => oldKeys[i] === newKeys[j]
  );

  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  // Emits the removed and added lines between two matches; lines removed and added at the same spot are paired
  // up so their changed words can be marked.
  const flush = (toI: number, toJ: number) => {
    const dels = oldLines.slice(i, toI).map((text, k) => ({ text, no: i + k + 1 }));
    const adds = newLines.slice(j, toJ).map((text, k) => ({ text, no: j + k + 1 }));
    const paired = Math.min(dels.length, adds.length);
    const delParts = dels.map((d, k) => (k < paired ? wordParts(d.text, adds[k].text).a : whole(d.text)));
    const addParts = adds.map((a, k) => (k < paired ? wordParts(dels[k].text, a.text).b : whole(a.text)));
    dels.forEach((d, k) => rows.push({ kind: "del", oldNo: d.no, newNo: null, parts: delParts[k] }));
    adds.forEach((a, k) => rows.push({ kind: "add", oldNo: null, newNo: a.no, parts: addParts[k] }));
    i = toI;
    j = toJ;
  };
  for (const [pi, pj] of pairs) {
    flush(pi, pj);
    // Show the new version of a matched line (its whitespace may differ).
    rows.push({ kind: "same", oldNo: pi + 1, newNo: pj + 1, parts: whole(newLines[pj]) });
    i = pi + 1;
    j = pj + 1;
  }
  flush(oldLines.length, newLines.length);
  return rows;
}

// How many lines changed, and in how many separate places.
export function diffStats(rows: DiffRow[]) {
  let places = 0;
  rows.forEach((r, idx) => {
    if (r.kind !== "same" && (idx === 0 || rows[idx - 1].kind === "same")) places++;
  });
  // A line edited in place is one removed and one added row; count it once.
  const added = rows.filter((r) => r.kind === "add").length;
  const removed = rows.filter((r) => r.kind === "del").length;
  return { lines: Math.max(added, removed), added, removed, places, changed: added + removed > 0 };
}

export type DiffItem = { type: "row"; row: DiffRow } | { type: "fold"; count: number };

// "Only changed lines": every change with `context` lines around it; the unchanged runs between become folds.
export function withContext(rows: DiffRow[], context = 2): DiffItem[] {
  const keep = new Array(rows.length).fill(false);
  rows.forEach((r, idx) => {
    if (r.kind === "same") return;
    for (let k = Math.max(0, idx - context); k <= Math.min(rows.length - 1, idx + context); k++) keep[k] = true;
  });
  const items: DiffItem[] = [];
  let folded = 0;
  rows.forEach((row, idx) => {
    if (keep[idx]) {
      if (folded) items.push({ type: "fold", count: folded });
      folded = 0;
      items.push({ type: "row", row });
    } else folded++;
  });
  if (folded) items.push({ type: "fold", count: folded });
  return items;
}

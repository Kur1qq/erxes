/**
 * @param {string} diff Git diff output produced with --unified=0.
 * @returns {Map<string, Set<number>>} Added or changed destination lines by file.
 */
export function addedLines(diff) {
  const changed = new Map();
  let file;

  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      file = undefined;
    } else if (line.startsWith('+++ ')) {
      const destination = line.slice(4);
      if (destination === '/dev/null') {
        file = undefined;
      } else if (destination.startsWith('b/') && !destination.includes('"')) {
        file = destination.slice(2);
      } else {
        throw new Error(`Cannot parse Git diff path: ${destination}`);
      }
    } else if (file && line.startsWith('@@ ')) {
      const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (!hunk) {
        throw new Error(`Cannot parse Git diff hunk: ${line}`);
      }

      const first = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      if (!changed.has(file)) {
        changed.set(file, new Set());
      }
      for (
        let lineNumber = first;
        lineNumber < first + count;
        lineNumber += 1
      ) {
        changed.get(file).add(lineNumber);
      }
    }
  }

  return changed;
}

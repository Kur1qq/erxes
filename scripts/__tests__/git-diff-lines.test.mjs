import assert from 'node:assert/strict';
import test from 'node:test';
import { addedLines } from '../git-diff-lines.mjs';

test('an empty diff has no changed lines', () => {
  assert.deepEqual(addedLines(''), new Map());
});

test('insertions and replacements include only destination hunk lines', () => {
  const changed = addedLines(
    [
      'diff --git a/example.ts b/example.ts',
      '--- a/example.ts',
      '+++ b/example.ts',
      '@@ -2,0 +3,2 @@',
      '+first();',
      '+second();',
      '@@ -9 +11 @@ function example() {',
      '-old();',
      '+replacement();',
    ].join('\n'),
  );

  assert.deepEqual(changed.get('example.ts'), new Set([3, 4, 11]));
  assert.equal(changed.get('example.ts').has(2), false);
});

test('a deletion-only hunk does not mark its surviving neighbor', () => {
  const changed = addedLines(
    'diff --git a/example.ts b/example.ts\n+++ b/example.ts\n@@ -3,2 +2,0 @@\n-old();\n-old();',
  );

  assert.deepEqual(changed.get('example.ts'), new Set());
});

test('findings after a rename use the destination path', () => {
  const changed = addedLines(
    'diff --git a/old.ts b/new.ts\nrename from old.ts\nrename to new.ts\n+++ b/new.ts\n@@ -3 +3 @@\n-before();\n+after();',
  );

  assert.deepEqual(changed, new Map([['new.ts', new Set([3])]]));
});

test('removed files and binary files do not inherit another file hunk', () => {
  const changed = addedLines(
    [
      'diff --git a/first.ts b/first.ts',
      '+++ b/first.ts',
      '@@ -0,0 +1 @@',
      '+first();',
      'diff --git a/deleted.ts b/deleted.ts',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-deleted();',
      'diff --git a/image.png b/image.png',
      'Binary files a/image.png and b/image.png differ',
      'diff --git a/last.ts b/last.ts',
      '+++ b/last.ts',
      '@@ -5,0 +6 @@',
      '+last();',
    ].join('\n'),
  );

  assert.deepEqual(
    changed,
    new Map([
      ['first.ts', new Set([1])],
      ['last.ts', new Set([6])],
    ]),
  );
});

test('unsupported quoted paths fail instead of skipping checks', () => {
  assert.throws(
    () => addedLines('+++ "b/quoted\\tfile.ts"\n@@ -0,0 +1 @@'),
    /Cannot parse Git diff path/,
  );
});

test('malformed hunk headers fail instead of skipping checks', () => {
  assert.throws(
    () => addedLines('+++ b/example.ts\n@@ malformed @@'),
    /Cannot parse Git diff hunk/,
  );
});

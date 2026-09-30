import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = 'frontend/plugins/frontline_ui/src/';
const rule = '@typescript-eslint/no-explicit-any';
const eslintBin = process.env.ERXES_ESLINT_BIN ?? join(root, 'node_modules/.bin/eslint');
const config = join(root, 'frontend/plugins/frontline_ui/eslint.config.js');

function addedLines(diff) {
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
      for (let lineNumber = first; lineNumber < first + count; lineNumber += 1) {
        changed.get(file).add(lineNumber);
      }
    }
  }

  return changed;
}

function lint(files, input) {
  const args = [
    '--config',
    config,
    '--rule',
    `${rule}:error`,
    '--rule',
    '@nx/enforce-module-boundaries:off',
    '--format',
    'json',
    ...files,
  ];
  const result = spawnSync(eslintBin, args, {
    cwd: root,
    encoding: 'utf8',
    input,
    maxBuffer: 32 * 1024 * 1024,
  });

  if (result.error || result.status === null || result.status > 1) {
    throw new Error(result.error?.message ?? result.stderr ?? 'ESLint could not run');
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`Could not read ESLint JSON output: ${result.stderr || result.stdout}`);
  }
}

function newAnyFindings(results, changed) {
  return results.flatMap((result) => {
    const file = relative(root, result.filePath);
    const lines = changed.get(file);
    return (result.messages ?? [])
      .filter((message) => message.ruleId === rule && lines?.has(message.line))
      .map((message) => `${file}:${message.line}:${message.column}: ${message.message}`);
  });
}

function selfTest() {
  const diff = [
    'diff --git a/frontend/plugins/frontline_ui/src/example.ts b/frontend/plugins/frontline_ui/src/example.ts',
    '+++ b/frontend/plugins/frontline_ui/src/example.ts',
    '@@ -2,0 +3,1 @@',
    '+const added: any = 2;',
  ].join('\n');
  const changed = addedLines(diff);
  const results = lint(
    ['--stdin', '--stdin-filename', `${sourceRoot}example.ts`],
    'const old: any = 1;\nconst safe = 1;\nconst added: any = 2;\n',
  );
  const findings = newAnyFindings(results, changed);
  if (findings.length !== 1 || !findings[0].includes(':3:')) {
    throw new Error(`Gate self-test failed: ${JSON.stringify(findings)}`);
  }
  process.stdout.write('Gate self-test passed: old any ignored, added any detected.\n');
}

function check(base) {
  if (!/^[0-9a-f]{40}$/.test(base)) {
    throw new Error('Pass the 40-character baseline commit SHA as the first argument.');
  }

  const diff = execFileSync(
    'git',
    ['diff', '--no-ext-diff', '--unified=0', '--find-renames', base, 'HEAD', '--', sourceRoot],
    { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  const changed = addedLines(diff);
  const files = [...changed.keys()].filter(
    (file) => file.startsWith(sourceRoot) && /\.tsx?$/.test(file) && existsSync(join(root, file)),
  );

  if (files.length === 0) {
    process.stdout.write('No added or changed frontline_ui TypeScript lines to check.\n');
    return;
  }

  const findings = newAnyFindings(lint(files), changed);
  if (findings.length > 0) {
    process.stderr.write(`New explicit any in frontline_ui:\n${findings.join('\n')}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`No new explicit any in ${files.length} changed TypeScript file(s).\n`);
  }
}

try {
  if (process.argv[2] === '--self-test') {
    selfTest();
  } else {
    check(process.argv[2] ?? '');
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

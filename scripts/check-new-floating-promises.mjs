import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = 'backend/plugins/frontline_api/src/';
const rule = '@typescript-eslint/no-floating-promises';

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

function newFindings(report, changed) {
  if (
    report.rule !== rule ||
    !Number.isInteger(report.scannedFiles) ||
    report.scannedFiles < 1 ||
    !Array.isArray(report.findings)
  ) {
    throw new Error('The Frontline API ESLint report is missing or invalid.');
  }

  for (const finding of report.findings) {
    if (
      typeof finding.file !== 'string' ||
      !finding.file.startsWith(sourceRoot) ||
      !Number.isInteger(finding.line) ||
      finding.line < 1 ||
      !Number.isInteger(finding.column) ||
      finding.column < 1
    ) {
      throw new Error(
        'The Frontline API ESLint report has an invalid finding.',
      );
    }
  }

  return report.findings.filter((finding) =>
    changed.get(finding.file)?.has(finding.line),
  );
}

function selfTest() {
  const diff = [
    'diff --git a/backend/plugins/frontline_api/src/example.ts b/backend/plugins/frontline_api/src/example.ts',
    '+++ b/backend/plugins/frontline_api/src/example.ts',
    '@@ -4,0 +5,1 @@',
    '+Promise.resolve();',
  ].join('\n');
  const report = {
    rule,
    scannedFiles: 1,
    findings: [
      { file: `${sourceRoot}example.ts`, line: 2, column: 1 },
      { file: `${sourceRoot}example.ts`, line: 5, column: 1 },
    ],
  };
  const findings = newFindings(report, addedLines(diff));
  if (findings.length !== 1 || findings[0].line !== 5) {
    throw new Error('Changed-line gate self-test failed.');
  }
  process.stdout.write('Changed-line gate self-test passed.\n');
}

function check(base, reportPath) {
  if (!/^[0-9a-f]{40}$/.test(base) || !reportPath) {
    throw new Error(
      'Pass the 40-character PR base SHA and ESLint JSON report.',
    );
  }

  const diff = execFileSync(
    'git',
    [
      'diff',
      '--no-ext-diff',
      '--unified=0',
      '--find-renames',
      base,
      'HEAD',
      '--',
      sourceRoot,
    ],
    { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const changed = addedLines(diff);
  const findings = newFindings(report, changed);

  if (findings.length > 0) {
    process.stderr.write(
      `New unhandled Promise in frontline_api:\n${findings
        .map(({ file, line, column }) => `${file}:${line}:${column}`)
        .join('\n')}\n`,
    );
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `No floating Promise finding on added or changed Frontline API lines; ${report.findings.length} existing finding(s) remain in the report.\n`,
    );
  }
}

try {
  if (process.argv[2] === '--self-test') {
    selfTest();
  } else {
    check(process.argv[2] ?? '', process.argv[3] ?? '');
  }
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}

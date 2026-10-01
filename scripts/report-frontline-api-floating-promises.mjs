import { spawnSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rule = '@typescript-eslint/no-floating-promises';
const sourceRoot = 'backend/plugins/frontline_api/src/';
const eslint = join(root, 'node_modules/.bin/eslint');
const reportIndex = process.argv.indexOf('--report');

if (reportIndex !== -1 && !process.argv[reportIndex + 1]) {
  throw new Error('Pass a JSON output path after --report.');
}

const result = spawnSync(
  eslint,
  [
    '--config',
    'eslint.config.js',
    '--parser-options',
    '{"projectService":true}',
    '--rule',
    `${rule}:error`,
    '--format',
    'json',
    `${sourceRoot}**/*.{ts,tsx}`,
  ],
  { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
);

if (result.error || result.status === null || result.status > 1) {
  throw new Error(
    result.error?.message ?? result.stderr ?? 'ESLint failed to run.',
  );
}

let reports;
try {
  reports = JSON.parse(result.stdout);
} catch {
  throw new Error(
    `Could not read ESLint JSON: ${result.stderr || result.stdout}`,
  );
}

if (!Array.isArray(reports) || reports.length === 0) {
  throw new Error('ESLint returned no Frontline API source files.');
}

const fatal = reports.flatMap((report) =>
  report.messages.filter((message) => message.fatal),
);
if (fatal.length > 0) {
  throw new Error(`ESLint reported ${fatal.length} fatal parsing error(s).`);
}

const findings = reports.flatMap((report) => {
  const file = relative(root, report.filePath).split(sep).join('/');
  return report.messages
    .filter((message) => message.ruleId === rule)
    .map((message) => ({ file, line: message.line, column: message.column }));
});

const modules = new Map();
for (const finding of findings) {
  const rest = finding.file.slice(sourceRoot.length);
  const module = rest.startsWith('modules/')
    ? rest.split('/')[1]
    : rest.split('/')[0];
  modules.set(module, (modules.get(module) ?? 0) + 1);
}

const summary = [
  '## Frontline API `no-floating-promises` pilot',
  '',
  `- Scanned files: ${reports.length}`,
  `- Existing findings: ${findings.length}`,
  '- Mode: report only; findings do not fail this job.',
  '- These are lint findings, not confirmed runtime bugs.',
  '',
  '| Area | Findings |',
  '| --- | ---: |',
  ...[...modules]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `| ${name} | ${count} |`),
  '',
].join('\n');

process.stdout.write(summary);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}
if (reportIndex !== -1) {
  writeFileSync(
    process.argv[reportIndex + 1],
    `${JSON.stringify(
      { rule, scannedFiles: reports.length, findings },
      null,
      2,
    )}\n`,
  );
}

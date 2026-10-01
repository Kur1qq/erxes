import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const project = 'frontend/plugins/frontline_ui/tsconfig.app.json';
const baselinePath = join(
  root,
  'scripts/baselines/frontline-ui-typecheck.json',
);
const configPath = join(root, project);

function normalizeMessage(diagnostic) {
  // Nested type explanations can render differently across machines for the same error.
  const message =
    typeof diagnostic.messageText === 'string'
      ? diagnostic.messageText
      : diagnostic.messageText.messageText;
  return message
    .replaceAll(root, '<repo>')
    .replaceAll('\\', '/')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectDiagnostics() {
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) {
    throw new Error(
      `Cannot read ${project}: ${normalizeMessage(config.error)}`,
    );
  }

  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    dirname(configPath),
    {
      noEmit: true,
    },
    configPath,
  );
  if (parsed.errors.length > 0 || parsed.fileNames.length === 0) {
    throw new Error(
      `Invalid or empty ${project}: ${parsed.errors
        .map(normalizeMessage)
        .join('; ')}`,
    );
  }

  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    projectReferences: parsed.projectReferences,
  });
  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .filter(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
    );

  const counts = new Map();
  for (const diagnostic of diagnostics) {
    const file = diagnostic.file
      ? relative(root, diagnostic.file.fileName).split(sep).join('/')
      : '<global>';
    if (file.startsWith('../') || file === '<global>') {
      throw new Error(
        `TypeScript reported a setup/global error: ${file} TS${
          diagnostic.code
        } ${normalizeMessage(diagnostic)}`,
      );
    }

    const entry = {
      file,
      code: diagnostic.code,
      message: normalizeMessage(diagnostic),
    };
    const key = JSON.stringify(entry);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts]
    .map(([key, count]) => ({ ...JSON.parse(key), count }))
    .sort(
      (a, b) =>
        a.file.localeCompare(b.file) ||
        a.code - b.code ||
        a.message.localeCompare(b.message),
    );
}

function countByArea(diagnostics) {
  const total = diagnostics.reduce(
    (sum, diagnostic) => sum + diagnostic.count,
    0,
  );
  const count = (prefix) =>
    diagnostics
      .filter((diagnostic) => diagnostic.file.startsWith(prefix))
      .reduce((sum, diagnostic) => sum + diagnostic.count, 0);
  return {
    total,
    frontline_ui: count('frontend/plugins/frontline_ui/'),
    'erxes-ui': count('frontend/libs/erxes-ui/'),
    'ui-modules': count('frontend/libs/ui-modules/'),
  };
}

function loadBaseline() {
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  if (
    baseline.schemaVersion !== 1 ||
    baseline.project !== project ||
    baseline.typescriptVersion !== ts.version ||
    !/^[0-9a-f]{40}$/.test(baseline.baseCommit) ||
    !Array.isArray(baseline.diagnostics) ||
    baseline.total !== countByArea(baseline.diagnostics).total
  ) {
    throw new Error(
      'Typecheck baseline metadata is invalid or does not match the installed TypeScript version.',
    );
  }
  return baseline;
}

function compare(current, baseline) {
  const oldCounts = new Map(
    baseline.diagnostics.map((entry) => [
      JSON.stringify({
        file: entry.file,
        code: entry.code,
        message: entry.message,
      }),
      entry.count,
    ]),
  );
  const increased = current.flatMap((entry) => {
    const key = JSON.stringify({
      file: entry.file,
      code: entry.code,
      message: entry.message,
    });
    const difference = entry.count - (oldCounts.get(key) ?? 0);
    return difference > 0 ? [{ ...entry, difference }] : [];
  });
  return increased;
}

function printSummary(current, baseline, increased) {
  const now = countByArea(current);
  const before = countByArea(baseline.diagnostics);
  process.stdout.write(
    `TypeScript ${ts.version}; baseline ${baseline.baseCommit}\n`,
  );
  process.stdout.write(
    `Diagnostics: ${now.total} current / ${before.total} baseline\n`,
  );
  process.stdout.write(
    `frontline_ui: ${now.frontline_ui}/${before.frontline_ui}; erxes-ui: ${now['erxes-ui']}/${before['erxes-ui']}; ui-modules: ${now['ui-modules']}/${before['ui-modules']}\n`,
  );
  if (increased.length === 0) {
    process.stdout.write('PASS: no diagnostic bucket increased.\n');
  } else {
    process.stderr.write(
      `FAIL: ${increased.length} diagnostic bucket(s) increased:\n`,
    );
    for (const entry of increased) {
      process.stderr.write(
        `+${entry.difference} ${entry.file} TS${entry.code}: ${entry.message}\n`,
      );
    }
    process.exitCode = 1;
  }
}

try {
  const [mode, argument, extra] = process.argv.slice(2);
  if (
    mode === '--write-baseline' &&
    /^[0-9a-f]{40}$/.test(argument) &&
    extra === undefined
  ) {
    const diagnostics = collectDiagnostics();
    const baseline = {
      schemaVersion: 1,
      project,
      baseCommit: argument,
      typescriptVersion: ts.version,
      total: countByArea(diagnostics).total,
      diagnostics,
    };
    mkdirSync(dirname(baselinePath), { recursive: true });
    writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
    process.stdout.write(
      `Wrote ${baseline.total} diagnostics to ${relative(
        root,
        baselinePath,
      )}.\n`,
    );
    process.stdout.write(`${JSON.stringify(countByArea(diagnostics))}\n`);
  } else if (
    mode === '--check' &&
    ((argument === undefined && extra === undefined) ||
      (argument === '--report' && extra !== undefined))
  ) {
    const baseline = loadBaseline();
    const current = collectDiagnostics();
    const increased = compare(current, baseline);
    if (extra) {
      writeFileSync(
        extra,
        `${JSON.stringify(
          {
            baselineCommit: baseline.baseCommit,
            ...countByArea(current),
            diagnostics: current,
            increased,
          },
          null,
          2,
        )}\n`,
      );
    }
    printSummary(current, baseline, increased);
  } else {
    throw new Error(
      'Usage: node scripts/check-frontline-typecheck.mjs --write-baseline <base SHA> | --check [--report <path>]',
    );
  }
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}

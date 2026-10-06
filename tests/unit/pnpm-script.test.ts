import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { expect, test } from 'vitest';

const script = resolve('scripts/pnpm.ps1');
const windows = process.platform === 'win32';

test('pnpm launcher remains independent of UTF-8 BOM and system code page', () => {
  expect([...readFileSync(script)].every((byte) => byte < 128)).toBe(true);
});

test.skipIf(!windows)('Windows PowerShell 5.1 parses the checked-in launcher', () => {
  const result = spawnSync('powershell.exe', [
    '-NoProfile',
    '-Command',
    '[Console]::WriteLine($PSVersionTable.PSVersion.ToString()); ' +
      '$taskTokens = $null; $taskErrors = $null; ' +
      '[void][System.Management.Automation.Language.Parser]::ParseFile(' +
      '$env:TASK_PNPM_SCRIPT, [ref]$taskTokens, [ref]$taskErrors); ' +
      'if ($taskErrors.Count) { $taskErrors | Out-String | Write-Error; exit 1 }',
  ], {
    env: { ...process.env, TASK_PNPM_SCRIPT: script },
    encoding: 'utf8',
    timeout: 10_000,
  });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout.trim()).toMatch(/^5\.1\./);
});

test.skipIf(!windows)('Windows PowerShell 5.1 forwards arguments and pnpm exit code', () => {
  const tempRoot = resolve(tmpdir());
  const folder = mkdtempSync(join(tempRoot, 'running-log-pnpm-'));
  const taskFolder = relative(tempRoot, resolve(folder));
  if (!taskFolder.startsWith('running-log-pnpm-') || taskFolder.includes(sep))
    throw new Error('Unexpected launcher test directory');
  try {
    writeFileSync(join(folder, 'pnpm.cmd'), '@echo off\r\necho %~1\r\necho %~2\r\nexit /b 23\r\n', 'ascii');
    const result = spawnSync('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script,
      '--flag', 'value with spaces',
    ], {
      env: { ...process.env, PATH: `${folder};${process.env.PATH}` },
      encoding: 'utf8',
      timeout: 10_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(23);
    expect(result.stdout.trim().split(/\r?\n/)).toEqual(['--flag', 'value with spaces']);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

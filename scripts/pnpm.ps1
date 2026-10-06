# Keep this script ASCII-only so Windows PowerShell 5.1 does not require a UTF-8 BOM.
# Run with an installed pnpm, or the Node/pnpm runtime bundled with Codex on Windows.
$ErrorActionPreference = 'Stop'
$taskPnpm = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
if ($taskPnpm) {
    & $taskPnpm.Source @args
} else {
    $taskRuntime = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node'
    $taskCli = Join-Path $taskRuntime 'node_modules\pnpm\bin\pnpm.cjs'
    $taskNode = Join-Path $taskRuntime 'bin\node.exe'
    if (-not (Test-Path -LiteralPath $taskCli)) { throw 'Install Node.js 24 LTS and pnpm 11.25.0, then retry.' }
    $env:PATH = (Join-Path $taskRuntime 'bin') + ';' + $env:PATH
    & $taskNode $taskCli @args
}
exit $LASTEXITCODE

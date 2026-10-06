# Run with an installed pnpm, or the Node/pnpm runtime bundled with Codex on Windows.
$ErrorActionPreference = 'Stop'
$taskPnpm = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
if ($taskPnpm) {
    & $taskPnpm.Source @args
} else {
    $taskRuntime = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node'
    $taskCli = Join-Path $taskRuntime 'node_modules\pnpm\bin\pnpm.cjs'
    $taskNode = Join-Path $taskRuntime 'bin\node.exe'
    if (-not (Test-Path -LiteralPath $taskCli)) { throw '请安装 Node.js 24 LTS 和 pnpm 11.25.0，然后重试。' }
    $env:PATH = (Join-Path $taskRuntime 'bin') + ';' + $env:PATH
    & $taskNode $taskCli @args
}
exit $LASTEXITCODE

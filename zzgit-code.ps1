$ErrorActionPreference = 'Stop'

Set-Location -LiteralPath $PSScriptRoot

function Invoke-Git {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArgs)
    & git @GitArgs
    if ($LASTEXITCODE -ne 0) {
        throw "git $($GitArgs -join ' ') failed with exit code $LASTEXITCODE."
    }
}

$branch = (& git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($branch)) {
    throw 'Could not determine the current Git branch. Check out a branch and retry.'
}

$upstream = (& git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>$null)
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($upstream)) {
    throw "Branch '$branch' has no upstream. Set one with: git push -u origin $branch"
}

Write-Host "Checking $branch against $upstream..." -ForegroundColor Cyan
Invoke-Git fetch

$status = @(& git status --porcelain)
if ($LASTEXITCODE -ne 0) { throw 'Could not read Git status.' }

if ($status.Count -gt 0) {
    Invoke-Git add -A
    $staged = @(& git diff --cached --name-only)
    if ($LASTEXITCODE -ne 0) { throw 'Could not inspect staged changes.' }

    if ($staged.Count -gt 0) {
        $message = "chore: sync project changes $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
        Invoke-Git commit -m $message
    }
}
else {
    Write-Host 'Working tree is clean.' -ForegroundColor DarkGray
}

$counts = (& git rev-list --left-right --count "$upstream...HEAD").Trim() -split '\s+'
if ($LASTEXITCODE -ne 0 -or $counts.Count -ne 2) {
    throw 'Could not compare this branch with its upstream.'
}
$remoteOnly = [int]$counts[0]
$localOnly = [int]$counts[1]

if ($remoteOnly -gt 0) {
    throw "$upstream has $remoteOnly commit(s) that are not in your local branch. Pull/reconcile those updates, then rerun this script. No push or deploy was done."
}

if ($localOnly -gt 0) {
    Write-Host "Pushing $localOnly local commit(s) to $upstream..." -ForegroundColor Cyan
    Invoke-Git push
}
else {
    Write-Host "No commits to push; $branch is up to date with $upstream." -ForegroundColor DarkGray
}

Write-Host 'Deploying to Cloudflare...' -ForegroundColor Cyan
npm run deploy
if ($LASTEXITCODE -ne 0) {
    throw "Cloudflare deploy failed with exit code $LASTEXITCODE."
}

Write-Host 'Push and Cloudflare deploy completed.' -ForegroundColor Green

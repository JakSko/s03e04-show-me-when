# Deploys the gated deploy folder to Railway and reads the live sha back (R14, A3). Windows PowerShell 7.
#
#   pwsh scripts/win-deploy.ps1 -DeployDir <dir> -Url https://<board> [-Service board] [-Project mega-s03e04-board] [-DryRun]
#
# Refuses unless: build_deploy.mjs --verify passes (gate.json pass for HEAD, clean tree, folder unchanged);
# origin/main on GitHub is HEAD; `railway status` in the deploy folder names the project.
# Then `railway up --service <service> --ci` from the deploy folder, and polls the live page until its
# <meta name="build"> and footer sha equal HEAD (or gives up after 3 minutes).
# -DryRun runs every check, prints each result, and stops before `railway up`.
param(
  [Parameter(Mandatory)] [string] $DeployDir,
  [string] $Url,
  [string] $Service = 'board',
  [string] $Project = 'mega-s03e04-board',
  [switch] $DryRun
)
$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent $PSScriptRoot
$DeployDir = (Resolve-Path $DeployDir).Path
$refusals = @()

function Step($name, $ok, $detail) {
  $mark = if ($ok) { 'ok  ' } else { 'FAIL' }
  Write-Output "[$mark] $name - $detail"
  if (-not $ok) { $script:refusals += $name }
}

# 1. the gate
$verify = & node (Join-Path $PSScriptRoot 'build_deploy.mjs') --verify $DeployDir 2>&1 | Out-String
Step 'gate' ($LASTEXITCODE -eq 0) $verify.Trim()

# 2. the deployed commit is on GitHub's main
$head = (git -C $Repo rev-parse HEAD).Trim()
$remote = ''
try { $remote = (git -C $Repo ls-remote origin refs/heads/main 2>$null | Out-String).Trim() } catch { }
$remoteSha = if ($remote) { ($remote -split '\s+')[0] } else { '' }
Step 'origin/main = HEAD' ($remoteSha -eq $head) "HEAD $head, origin/main $(if ($remoteSha) { $remoteSha } else { '(none)' })"

# 3. the deploy folder is linked to our project, and only to it
Push-Location $DeployDir
try {
  $statusJson = railway status --json 2>$null | Out-String
  $linked = if ($LASTEXITCODE -eq 0 -and $statusJson) { ($statusJson | ConvertFrom-Json).name } else { '' }
} finally { Pop-Location }
Step 'railway project' ($linked -eq $Project) "linked: $(if ($linked) { $linked } else { '(none)' }), expected $Project"

if (-not $Url -and -not $DryRun) { Step 'url' $false 'pass -Url https://<board>' }
elseif ($Url) { Step 'url' ($Url -match '^https://') $Url }

if ($refusals.Count -gt 0) {
  Write-Output "REFUSED: $($refusals -join ', ')"
  exit 1
}
if ($DryRun) {
  Write-Output "DRY RUN: every check passed; stopping before railway up"
  exit 0
}

# 4. deploy
Push-Location $DeployDir
try {
  Write-Output "railway up --service $Service --ci (from $DeployDir)"
  railway up --service $Service --ci
  $upExit = $LASTEXITCODE
} finally { Pop-Location }
Write-Output "railway up exit: $upExit"
if ($upExit -ne 0) { Write-Output 'REFUSED: railway up failed'; exit 1 }

# 5. read the live sha back
$deadline = (Get-Date).AddMinutes(3)
do {
  $body = ''
  try { $body = (curl.exe -sS --max-time 15 "$Url/?nocache=$([guid]::NewGuid())") | Out-String } catch { }
  $meta = [regex]::Match($body, '<meta name="build" content="([0-9a-f]{40})"').Groups[1].Value
  $foot = [regex]::Match($body, 'data-testid="build-sha"[^>]*>([0-9a-f]{40})<').Groups[1].Value
  if ($meta -eq $head -and $foot -eq $head) {
    Write-Output "LIVE OK: $Url serves $head (meta and footer); origin/main $remoteSha"
    exit 0
  }
  Start-Sleep -Seconds 10
} while ((Get-Date) -lt $deadline)
Write-Output "LIVE MISMATCH: meta '$meta', footer '$foot', HEAD $head"
exit 1

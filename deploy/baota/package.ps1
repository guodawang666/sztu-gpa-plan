$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$outputRoot = Join-Path $repositoryRoot 'outputs'
$stageRoot = Join-Path $outputRoot 'sztu-gpa-planner-baota'
$archivePath = Join-Path $outputRoot 'sztu-gpa-planner-baota.zip'

if (-not $stageRoot.StartsWith($outputRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Unsafe package output path.'
}

if (Test-Path -LiteralPath $stageRoot) {
  Remove-Item -LiteralPath $stageRoot -Recurse -Force
}
if (Test-Path -LiteralPath $archivePath) {
  Remove-Item -LiteralPath $archivePath -Force
}

New-Item -ItemType Directory -Path (Join-Path $stageRoot 'public') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stageRoot 'api') -Force | Out-Null

Copy-Item -Path (Join-Path $repositoryRoot 'frontend\dist\*') -Destination (Join-Path $stageRoot 'public') -Recurse -Force
Copy-Item -Path (Join-Path $repositoryRoot 'backend\dist') -Destination (Join-Path $stageRoot 'api\dist') -Recurse -Force
Copy-Item -LiteralPath (Join-Path $repositoryRoot 'backend\package.json') -Destination (Join-Path $stageRoot 'api\package.json')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'ecosystem.config.cjs') -Destination (Join-Path $stageRoot 'ecosystem.config.cjs')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'nginx-gpa.gzkang.com.conf') -Destination (Join-Path $stageRoot 'nginx-gpa.gzkang.com.conf')
Copy-Item -LiteralPath (Join-Path $repositoryRoot 'outputs\BAOTA_DEPLOYMENT.md') -Destination (Join-Path $stageRoot 'DEPLOYMENT.md')

Compress-Archive -Path (Join-Path $stageRoot '*') -DestinationPath $archivePath -CompressionLevel Optimal
Write-Output "Baota upload package created: $archivePath"

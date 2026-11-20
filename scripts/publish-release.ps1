param(
  [Parameter(Mandatory = $true)]
  [string]$Version,

  [string]$NotesFile = "RELEASE_NOTES.md"
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

$CleanVersion = $Version.TrimStart('v')
$Tag = "v$CleanVersion"

Write-Host "Przygotowanie wydania Peak Launcher $Tag..." -ForegroundColor Cyan

# 1. Zaktualizuj wersje w package.json
$pkgPath = Join-Path $RootDir "package.json"
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
$pkg.version = $CleanVersion
$pkg | ConvertTo-Json -Depth 10 | Set-Content $pkgPath -Encoding UTF8

# 2. Zbuduj instalator i portable .exe
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npm run dist

$setupExe = Join-Path $RootDir "dist\Peak-Launcher-Setup-$CleanVersion.exe"
$portableExe = Join-Path $RootDir "dist\Peak-Launcher-Portable-$CleanVersion.exe"

if (!(Test-Path $setupExe) -or !(Test-Path $portableExe)) {
  throw "Brak zbudowanych plikow .exe w folderze dist\"
}

# 3. Commit, tag i push (main + gh-pages)
git add -A
git commit -m "Release $Tag"
git tag -a $Tag -m "Peak Launcher $Tag"
git push origin HEAD
git push origin $Tag
$pagesCommit = git subtree split --prefix=website HEAD
git push origin "${pagesCommit}:refs/heads/gh-pages" --force

# 4. Opublikuj na GitHub Releases
$notesFullPath = Join-Path $RootDir $NotesFile
if (Test-Path $notesFullPath) {
  gh release create $Tag $setupExe $portableExe --title "Peak Launcher $CleanVersion" --notes-file $notesFullPath
} else {
  gh release create $Tag $setupExe $portableExe --title "Peak Launcher $CleanVersion" --generate-notes
}

Write-Host "Wydanie $Tag opublikowane!" -ForegroundColor Green

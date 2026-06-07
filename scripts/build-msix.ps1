<#
  build-msix.ps1 - Build the Microsoft Store MSIX for Format Reaper.

  Produces an UNSIGNED .msix with the real Partner Center identity baked in.
  Do NOT sign it for Store upload - Microsoft re-signs Store packages.
  (Signing is only needed for the local sideload test, see -SideloadTest.)

  Usage:
    pwsh scripts/build-msix.ps1                # build Store msix
    pwsh scripts/build-msix.ps1 -SkipBuild     # reuse existing release exe
    pwsh scripts/build-msix.ps1 -SideloadTest  # also build a signed test copy

  After build, upload msix/FormatReaper_<ver>_x64.msix to Partner Center.
#>
param(
  [switch]$SkipBuild,
  [switch]$SideloadTest
)
$ErrorActionPreference = "Stop"

$repo     = Split-Path -Parent $PSScriptRoot
$msixDir  = Join-Path $repo "msix"
$stage    = Join-Path $msixDir "package"
$assets   = Join-Path $stage "Assets"
$iconsDir = Join-Path $repo "src-tauri\icons"
$relExe   = Join-Path $repo "src-tauri\target\release\format-reaper.exe"

# Version comes from the canonical manifest (keep it the single source of truth).
[xml]$mf = Get-Content (Join-Path $msixDir "AppxManifest.xml")
$version = $mf.Package.Identity.Version
$outMsix = Join-Path $msixDir "FormatReaper_${version}_x64.msix"

# Locate the latest Windows SDK bin (makeappx / signtool).
$sdkRoot = "C:\Program Files (x86)\Windows Kits\10\bin"
$sdkVer  = Get-ChildItem $sdkRoot -Directory | Where-Object { $_.Name -match '^10\.' } |
           Sort-Object Name -Descending | Select-Object -First 1
$makeappx = Join-Path $sdkRoot "$($sdkVer.Name)\x64\makeappx.exe"
$signtool = Join-Path $sdkRoot "$($sdkVer.Name)\x64\signtool.exe"

if (-not $SkipBuild) {
  Write-Host "==> Building release exe (npm run tauri build)..."
  Push-Location $repo
  npm run tauri build
  Pop-Location
}
if (-not (Test-Path $relExe)) { throw "Release exe not found at $relExe" }

Write-Host "==> Staging package layout..."
Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $assets | Out-Null
Copy-Item $relExe (Join-Path $stage "format-reaper.exe") -Force
Copy-Item (Join-Path $msixDir "AppxManifest.xml") (Join-Path $stage "AppxManifest.xml") -Force
foreach ($logo in @("Square30x30Logo","Square44x44Logo","Square71x71Logo","Square89x89Logo",
                    "Square107x107Logo","Square142x142Logo","Square150x150Logo",
                    "Square284x284Logo","Square310x310Logo","StoreLogo")) {
  Copy-Item (Join-Path $iconsDir "$logo.png") $assets -Force
}

Write-Host "==> Packing Store MSIX (unsigned)..."
& $makeappx pack /d $stage /p $outMsix /o
if ($LASTEXITCODE -ne 0) { throw "makeappx failed" }
Write-Host "==> Store package ready (UNSIGNED, upload as-is):"
Write-Host "    $outMsix"

if ($SideloadTest) {
  Write-Host "==> Building signed sideload-test copy..."
  $testStage = Join-Path $msixDir "package-test"
  Remove-Item -Recurse -Force $testStage -ErrorAction SilentlyContinue
  Copy-Item -Recurse $stage $testStage
  $testManifest = Join-Path $testStage "AppxManifest.xml"
  (Get-Content $testManifest -Raw) -replace 'Publisher="CN=[^"]+"', 'Publisher="CN=EERIE-FormatReaper-Dev"' |
    Set-Content $testManifest -Encoding UTF8
  $testMsix = Join-Path $msixDir "FormatReaper_TEST.msix"
  & $makeappx pack /d $testStage /p $testMsix /o
  if ($LASTEXITCODE -ne 0) { throw "test makeappx failed" }

  $cert = Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -eq 'CN=EERIE-FormatReaper-Dev' } | Select-Object -First 1
  if (-not $cert) {
    $cert = New-SelfSignedCertificate -Type Custom -Subject "CN=EERIE-FormatReaper-Dev" `
      -KeyUsage DigitalSignature -FriendlyName "Format Reaper Dev" `
      -CertStoreLocation "Cert:\CurrentUser\My" `
      -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3","2.5.29.19={text}")
  }
  $pfx = Join-Path $msixDir "frdev.pfx"
  $cer = Join-Path $msixDir "frdev.cer"
  $pw  = ConvertTo-SecureString -String "frdev123" -Force -AsPlainText
  Export-PfxCertificate -Cert "Cert:\CurrentUser\My\$($cert.Thumbprint)" -FilePath $pfx -Password $pw | Out-Null
  Export-Certificate -Cert $cert -FilePath $cer -Force | Out-Null
  & $signtool sign /fd SHA256 /a /f $pfx /p "frdev123" $testMsix
  Write-Host "==> Signed test package: $testMsix"
  Write-Host "    To install (run elevated):"
  Write-Host "    Import-Certificate -FilePath '$cer' -CertStoreLocation Cert:\LocalMachine\TrustedPeople"
  Write-Host "    Add-AppxPackage '$testMsix'"
}

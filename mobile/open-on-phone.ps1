# Opens the DAPOS mobile web app on a USB-connected Android phone.
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
if (-not (Test-Path $adb)) {
  Write-Error "adb not found. Install Android SDK platform-tools."
  exit 1
}

Write-Host "Waiting for Android device (enable USB debugging on your phone)..."
$deadline = (Get-Date).AddMinutes(2)
$device = $null
while ((Get-Date) -lt $deadline) {
  $lines = & $adb devices 2>$null | Select-Object -Skip 1 | Where-Object { $_ -match "\tdevice$" }
  if ($lines) {
    $device = ($lines[0] -split "`t")[0]
    break
  }
  Start-Sleep -Seconds 2
}

if (-not $device) {
  Write-Host ""
  Write-Host "No device found. On your Samsung phone:"
  Write-Host "  1. Settings -> About phone -> Software information"
  Write-Host "  2. Tap 'Build number' 7 times (Developer mode on)"
  Write-Host "  3. Settings -> Developer options -> USB debugging ON"
  Write-Host "  4. Unplug and replug USB, tap 'Allow' on the phone"
  Write-Host "  5. Run this script again"
  exit 1
}

Write-Host "Device: $device"
& $adb reverse tcp:8081 tcp:8081
& $adb reverse tcp:3000 tcp:3000

$url = "http://127.0.0.1:8081"
Write-Host "Opening $url on phone..."
& $adb shell am start -a android.intent.action.VIEW -d $url

Write-Host "Done. Login: phone 0501234567  PIN 1234"

# Bring the window that hosts a Claude Code session to the front, found by process:
# from the session's process ID, walk up the parent processes to the first one that owns
# a window (Windows Terminal, VS Code, a console window). TOWER_PID names the session's
# process; TOWER_DRY, when set, only reports the window it would bring forward.
$ErrorActionPreference = 'SilentlyContinue'
$id = [int]$env:TOWER_PID
$visited = @{}
$owner = $null
while ($id -gt 0 -and -not $visited.ContainsKey($id)) {
  $visited[$id] = $true
  $proc = Get-Process -Id $id
  if ($proc -and $proc.MainWindowHandle -ne [IntPtr]::Zero) { $owner = $proc; break }
  $id = [int](Get-CimInstance Win32_Process -Filter "ProcessId=$id").ParentProcessId
}
if (-not $owner) { exit 2 }
$title = if ($owner.MainWindowTitle) { $owner.MainWindowTitle } else { $owner.ProcessName }
if ($env:TOWER_DRY) { "$($owner.ProcessName)`t$title"; exit 0 }
$shown = (New-Object -ComObject WScript.Shell).AppActivate($owner.Id)
"$($owner.ProcessName)`t$title"
if (-not $shown) { exit 1 }

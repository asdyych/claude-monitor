const { exec } = require('child_process');

// Simplified script - just get processes and output as JSON
const script = `
$procs = Get-WmiObject Win32_PerfFormattedData_PerfProc_Process | Where-Object { $_.Name -like 'node*' }
$cmdLines = Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^node' }
$results = @()
foreach ($p in $procs) {
  $cmd = $cmdLines | Where-Object { $_.ProcessId -eq $p.IDProcess } | Select-Object -First 1
  $results += [PSCustomObject]@{
    ProcessId = $p.IDProcess
    Name = ($p.Name -replace '#.*$', '')
    PercentProcessorTime = [int]$p.PercentProcessorTime
    WorkingSetPrivate = [int64]$p.WorkingSetPrivate
    CommandLine = $(if ($cmd) { $cmd.CommandLine } else { $p.Name })
  }
}
$results | ConvertTo-Json -Compress
`.trim();

console.log('Script:\n', script);

exec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${script}"`, { timeout: 15000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
  if (err) console.error('Error:', err.message);
  if (stderr) console.error('Stderr:', stderr);
  console.log('Stdout length:', stdout.length);
  console.log('Stdout sample:', stdout.substring(0, 500));
});

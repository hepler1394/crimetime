# Wait for the network before a scheduled job touches it.
#
# On 2026-09-18 the Tuesday content run died on "Could not resolve host: github.com", and on
# 2026-09-21 the Monday episode job died three minutes in with "fetch failed" from both Gemini
# and Anthropic. Both ran at their scheduled minute; both worked by hand later the same day.
# The machine simply was not on the network yet when the task fired, and neither job waited.
#
# A whole week's episode was lost to about ninety seconds of DNS.
#
# This dot-sources into each wrapper and blocks until the network answers or the deadline
# passes. It is deliberately built on .NET calls rather than cmdlets: Windows PowerShell 5.1
# turns a native command's stderr into a fatal error, and Resolve-DnsName writes to the error
# stream on every failed attempt, which is exactly the shape of the bug in the first place.
#
# It never throws. A job that would have failed at 08:00 now starts at 08:02 instead, and a
# genuine outage still fails the same way it did before, just later and with a line saying so.

function Test-NetworkUp {
    try {
        $null = [System.Net.Dns]::GetHostEntry("github.com")
    } catch {
        return $false
    }
    $client = $null
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        return $client.ConnectAsync("github.com", 443).Wait(5000)
    } catch {
        return $false
    } finally {
        if ($client) { try { $client.Close() } catch { } }
    }
}

# Returns $true if the network came up. Logs how long it waited so cron.log tells the story.
function Wait-ForNetwork {
    param([int]$MaxSeconds = 600, [int]$EverySeconds = 15, [string]$LogPath = $null)
    $started = Get-Date
    if (Test-NetworkUp) { return $true }
    $deadline = $started.AddSeconds($MaxSeconds)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds $EverySeconds
        if (Test-NetworkUp) {
            $waited = [int]((Get-Date) - $started).TotalSeconds
            if ($LogPath) { Add-Content -Path $LogPath -Value "$(Get-Date -Format o)  network came up after ${waited}s" -Encoding UTF8 }
            return $true
        }
    }
    $waited = [int]((Get-Date) - $started).TotalSeconds
    if ($LogPath) { Add-Content -Path $LogPath -Value "$(Get-Date -Format o)  NETWORK STILL DOWN after ${waited}s; running anyway" -Encoding UTF8 }
    return $false
}

param(
  [string]$OutputPath = (Join-Path $PSScriptRoot "..\next\data\ese-provisional-dec-2026.json")
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$sourceUrl = "https://academics.gndec.ac.in/datesheet/"
$page = Invoke-WebRequest -Uri $sourceUrl -TimeoutSec 40 -UseBasicParsing
$pageHtml = [string]$page.Content
if ($page.StatusCode -ne 200 -or $pageHtml -notmatch "Provisional Datesheet for End Semester Examination Dec, 2026") {
  throw "The official GNDEC page did not return the expected provisional December 2026 datesheet."
}

function Convert-HtmlFragmentToText([string]$Value) {
  $plain = [regex]::Replace($Value, "(?is)<script\b.*?</script>|<style\b.*?</style>|<[^>]+>", " ")
  return [System.Net.WebUtility]::HtmlDecode(($plain -replace "\s+", " ")).Trim()
}

function Get-ProgrammeCode([string]$Id, [string]$Label) {
  switch ($Id) {
    "1,14" { return "CE" }
    "1,15" { return "CSE" }
    "1,17" { return "ECE" }
    "1,16" { return "EE" }
    "1,21" { return "IT" }
    "1,30" { return "ME" }
    "1,31" { return "PE" }
    "1,51" { return "RAI" }
    "1,32" { return "MEP" }
    "3,28" { return "MBA" }
    "4,29" { return "MCA" }
    "7,91" { return "BCA" }
    "10,96" { return "BBA" }
    "9,97" { return "BVOC" }
    "13,98" { return "BCOM" }
    "2,50" { return "MTECH-CSE" }
    "2,35" { return "MTECH-ECE" }
    "2,34" { return "MTECH-EE" }
    "2,36" { return "MTECH-ENV" }
    "2,37" { return "MTECH-IE" }
    "2,43" { return "MTECH-POWER" }
    "2,44" { return "MTECH-PE" }
    "2,45" { return "MTECH-SE" }
    "2,47" { return "MTECH-VLSI" }
    "2,38" { return "MTECH-IT" }
    "2,76" { return "MTECH-SMFE" }
    "2,65" { return "MTECH-GEOTECH" }
    "2,63" { return "MTECH-ENERGY" }
    "2,41" { return "MTECH-ME" }
    "6,82" { return "PHD-CSE" }
    "6,81" { return "PHD-CE" }
    "6,84" { return "PHD-ECE" }
    "1,151" { return "MINOR-CSE" }
    "2,39" { return "MTECH-CSIT" }
    "1,211" { return "MINOR-IT" }
    "1,171" { return "MINOR-ECE" }
    "1,161" { return "MINOR-EE" }
    "1,52" { return "CE-LE-WP" }
    "1,53" { return "ME-LE-WP" }
  }
  $slug = ($Label.ToLowerInvariant() -replace "[^a-z0-9]+", "-").Trim("-")
  return $slug
}

$programmes = @(
  [regex]::Matches($pageHtml, "(?is)<option\s+value=[`"']([^`"']+)[`"']\s*>(.*?)</option>") |
    ForEach-Object {
      $id = $_.Groups[1].Value.Trim()
      $label = Convert-HtmlFragmentToText $_.Groups[2].Value
      if ($id -match "^\d+,\d+$" -and $label) {
        [pscustomobject]@{ id = $id; label = $label; code = (Get-ProgrammeCode $id $label) }
      }
    }
)
if ($programmes.Count -lt 30) { throw "Only $($programmes.Count) official programme choices were parsed; refusing to replace the verified snapshot." }

$modes = @("Full Time", "Part Time")
$records = [System.Collections.Generic.List[object]]::new()
$failures = [System.Collections.Generic.List[string]]::new()
foreach ($programme in $programmes) {
  foreach ($mode in $modes) {
    try {
      $response = Invoke-WebRequest -Uri $sourceUrl -Method Post -Body @{
        course_branch = $programme.id
        full_part_time = $mode
        datesheet_view_show = "datesheet_view_show"
        submit = "View Datesheet"
      } -ContentType "application/x-www-form-urlencoded" -TimeoutSec 40 -UseBasicParsing
      $html = [string]$response.Content
      if ($response.StatusCode -ne 200 -or $html -notmatch "Provisional Datesheet for End Semester Examination Dec, 2026") {
        throw "Unexpected response from the official datesheet page."
      }

      $entries = [System.Collections.Generic.List[object]]::new()
      foreach ($row in [regex]::Matches($html, "(?is)<tr\b[^>]*>(.*?)</tr>")) {
        $cells = @([regex]::Matches($row.Groups[1].Value, "(?is)<t[dh]\b[^>]*>(.*?)</t[dh]>") |
          ForEach-Object { Convert-HtmlFragmentToText $_.Groups[1].Value })
        if ($cells.Count -lt 8 -or $cells[0] -notmatch "^(\d{2})-(\d{2})-(20\d{2})$") { continue }

        $month = [int]$Matches[2]
        $day = [int]$Matches[1]
        $year = [int]$Matches[3]
        $date = "{0:D4}-{1:D2}-{2:D2}" -f $year, $month, $day
        $semester = 0
        if (-not [int]::TryParse($cells[2], [ref]$semester) -or $semester -lt 1 -or $semester -gt 12) { continue }
        $sessionCode = $cells[1].ToUpperInvariant()
        if ($sessionCode -notin @("M", "E")) { continue }
        $isMorning = $sessionCode -eq "M"
        if ($isMorning) {
          $session = "Morning"
          $sessionStart = 540
          $sessionEnd = 720
          $sessionRaw = "9:00 AM to 12:00 Noon (Morning)"
        } else {
          $session = "Evening"
          $sessionStart = 780
          $sessionEnd = 960
          $sessionRaw = "1:00 PM to 4:00 PM (Evening)"
        }
        $entries.Add([pscustomobject]@{
          date = $date
          sessionCode = $sessionCode
          session = $session
          sessionStart = $sessionStart
          sessionEnd = $sessionEnd
          sessionRaw = $sessionRaw
          semester = $semester
          semesterNumber = $semester
          subject = $cells[3]
          subjectCode = $cells[4]
          paperId = $cells[5]
          mCode = $cells[6]
          schemeCode = $cells[7]
        })
      }

      $records.Add([pscustomobject]@{
        id = $programme.id
        code = $programme.code
        label = $programme.label
        studyMode = $mode
        entries = @($entries)
      })
      Write-Host ("{0} · {1}: {2} sittings" -f $programme.label, $mode, $entries.Count)
    } catch {
      $failures.Add(("{0} · {1}: {2}" -f $programme.label, $mode, $_.Exception.Message))
    }
  }
}

if ($failures.Count) {
  $failures | ForEach-Object { Write-Error $_ }
  throw "Datesheet refresh failed for $($failures.Count) programme/mode requests; the existing snapshot was left untouched."
}

$sittings = @($records | ForEach-Object { $_.entries }).Count
if ($sittings -lt 100) { throw "Only $sittings sittings were parsed; refusing to replace the verified snapshot." }
$available = @($records | Where-Object { $_.entries.Count -gt 0 }).Count
$payload = [ordered]@{
  title = "Provisional Datesheet for End Semester Examination Dec, 2026"
  status = "Provisional"
  checkedAt = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
  source = [ordered]@{
    title = "Provisional Datesheet for End Semester Examination Dec, 2026"
    url = $sourceUrl
    publishedBy = "GNDEC Academics"
    provenance = "Programme and semester rows were read from the official GNDEC Academics form using Full Time and Part Time selections. Session windows are printed on that page. No dates or paper details are inferred."
  }
  timingNote = "The official page states Morning 9:00 AM to 12:00 Noon and Evening 1:00 PM to 4:00 PM for theory examinations."
  programmes = @($records)
  totals = [ordered]@{
    programmes = $programmes.Count
    programmeModes = $records.Count
    availableProgrammeModes = $available
    sittings = $sittings
  }
}
$json = $payload | ConvertTo-Json -Depth 10
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
$directory = [System.IO.Path]::GetDirectoryName($resolvedOutput)
New-Item -ItemType Directory -Force -Path $directory | Out-Null
$temporaryOutput = "$resolvedOutput.tmp"
[System.IO.File]::WriteAllText($temporaryOutput, $json + "`n", [System.Text.UTF8Encoding]::new($false))
Move-Item -LiteralPath $temporaryOutput -Destination $resolvedOutput -Force
Write-Host ("Saved {0} programme-mode selections and {1} dated sittings ({2} selections contain papers) to {3}" -f $records.Count, $sittings, $available, $resolvedOutput)

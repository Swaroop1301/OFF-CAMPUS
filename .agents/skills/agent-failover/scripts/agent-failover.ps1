<#
.SYNOPSIS
    Antigravity Automatic Agent & Model Failover Script
.DESCRIPTION
    Executes a task using the Antigravity CLI (agy). If the primary agent or model
    encounters rate limits, quota exhaustion, or service unavailability, this script
    automatically transitions execution to the next available agent/model in the pool,
    preserving context and logs while preventing infinite loops.
.PARAMETER Prompt
    The user objective or task prompt to execute.
.PARAMETER Models
    Optional ordered list of foundation models to use as fallbacks.
.PARAMETER Agents
    Optional ordered list of agents to use as fallbacks.
.PARAMETER ConfigFile
    Path to configuration JSON file. Defaults to config.json adjacent to this script.
.PARAMETER MaxRetries
    Maximum number of failover attempts before giving up.
.PARAMETER DryRun
    Simulates the failover sequence without executing actual agy commands.
.EXAMPLE
    pwsh -File agent-failover.ps1 -Prompt "Run unit tests and fix any failing cases"
#>

[CmdletBinding()]
param (
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Prompt,

    [Parameter(Mandatory = $false)]
    [string[]]$Models,

    [Parameter(Mandatory = $false)]
    [string[]]$Agents,

    [Parameter(Mandatory = $false)]
    [string]$ConfigFile,

    [Parameter(Mandatory = $false)]
    [int]$MaxRetries,

    [Parameter(Mandatory = $false)]
    [switch]$DryRun
)

$ErrorActionPreference = "Continue"

# Resolve script root and config path
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BaseSkillDir = Split-Path -Parent $ScriptDir
if ([string]::IsNullOrWhiteSpace($ConfigFile)) {
    $ConfigFile = Join-Path $BaseSkillDir "config.json"
}

# Ensure agy is on PATH
$AgyDefaultBin = Join-Path $env:LOCALAPPDATA "agy\bin"
if (Test-Path $AgyDefaultBin) {
    if ($env:PATH -notmatch [regex]::Escape($AgyDefaultBin)) {
        $env:PATH = "$AgyDefaultBin;" + $env:PATH
    }
}

# Ensure coderabbit is on PATH
$CrDefaultBin = Join-Path $env:LOCALAPPDATA "Programs\coderabbit"
if (Test-Path $CrDefaultBin) {
    if ($env:PATH -notmatch [regex]::Escape($CrDefaultBin)) {
        $env:PATH = "$CrDefaultBin;" + $env:PATH
    }
}

# Locate agy executable
$AgyExe = Get-Command "agy.exe" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
if (-not $AgyExe) {
    $Candidate = Join-Path $AgyDefaultBin "agy.exe"
    if (Test-Path $Candidate) {
        $AgyExe = $Candidate
    }
}

# Load configuration
$Config = $null
if (Test-Path $ConfigFile) {
    try {
        $Config = Get-Content -LiteralPath $ConfigFile -Raw | ConvertFrom-Json
    } catch {
        Write-Warning "Failed to parse $ConfigFile. Using defaults."
    }
}

# Determine enabled status
if ($Config -and ($Config.enabled -eq $false)) {
    Write-Host "[FAILOVER] Failover system is disabled in config.json. Running single execution."
}

# Resolve Models list
$EffectiveModels = @()
if ($Models -and $Models.Count -gt 0) {
    $EffectiveModels = @($Models | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
} elseif ($Config -and $Config.models -and $Config.models.Count -gt 0) {
    $EffectiveModels = @($Config.models)
} else {
    $EffectiveModels = @("gemini-3.8-flash-high", "gemini-3.7-flash-high", "claude-sonnet-4-6")
}

# Resolve Agents list
$EffectiveAgents = @()
if ($Agents -and $Agents.Count -gt 0) {
    $EffectiveAgents = @($Agents | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
} elseif ($Config -and $Config.agents -and $Config.agents.Count -gt 0) {
    $EffectiveAgents = @($Config.agents)
} else {
    $EffectiveAgents = @("gsd-executor", "gsd-code-fixer")
}

# Resolve MaxRetries
$EffectiveMaxRetries = 5
if ($PSBoundParameters.ContainsKey('MaxRetries') -and $MaxRetries -gt 0) {
    $EffectiveMaxRetries = $MaxRetries
} elseif ($Config -and $Config.max_retries) {
    $EffectiveMaxRetries = [int]$Config.max_retries
}

# Resolve error signatures
$RetrySignatures = @(
    "quota",
    "rate_limit",
    "resource_exhausted",
    "model_unavailable",
    "capacity",
    "UNAVAILABLE",
    "429",
    "503",
    "RESOURCE_EXHAUSTED",
    "overloaded",
    "Too Many Requests"
)
if ($Config -and $Config.retry_on) {
    $RetrySignatures = @($Config.retry_on)
}

# Setup log directory
$LogDir = Join-Path $BaseSkillDir "logs"
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

$Timestamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
$SessionLogFile = Join-Path $LogDir "failover-$Timestamp.log"

function Log-Message {
    param ([string]$Msg)
    $Line = "[$(Get-Date -Format 'HH:mm:ss')] $Msg"
    Write-Host $Line
    Add-Content -LiteralPath $SessionLogFile -Value $Line -Encoding utf8
}

Log-Message "═══════════════════════════════════════════════════════════════"
Log-Message "  ANTIGRAVITY AGENT FAILOVER RUNNER"
Log-Message "═══════════════════════════════════════════════════════════════"
Log-Message "Task Prompt   : $Prompt"
Log-Message "Config File   : $ConfigFile"
Log-Message "Max Retries   : $EffectiveMaxRetries"
Log-Message "Model Pool    : $($EffectiveModels -join ', ')"
Log-Message "Agent Pool    : $($EffectiveAgents -join ', ')"
Log-Message "Session Log   : $SessionLogFile"
Log-Message "───────────────────────────────────────────────────────────────"

if (-not $AgyExe -and -not $DryRun) {
    Log-Message "[ERROR] Could not find 'agy.exe'. Please ensure Antigravity CLI is installed."
    exit 1
}

# Build fallback candidate execution pairs
$Candidates = @()
foreach ($m in $EffectiveModels) {
    foreach ($a in $EffectiveAgents) {
        $Candidates += [PSCustomObject]@{
            Model = $m
            Agent = $a
        }
    }
}

if ($Candidates.Count -eq 0) {
    Log-Message "[ERROR] Candidate execution pool is empty."
    exit 1
}

$Attempt = 0
$Success = $false
$WinningCandidate = $null
$ExcludedKeys = @{}

foreach ($Candidate in $Candidates) {
    if ($Attempt -ge $EffectiveMaxRetries) {
        Log-Message "[WARNING] Reached maximum allowed attempts ($EffectiveMaxRetries). Stopping."
        break
    }

    $CandidateKey = "$($Candidate.Model)::$($Candidate.Agent)"
    if ($ExcludedKeys.ContainsKey($CandidateKey)) {
        continue
    }

    $Attempt++
    Log-Message ""
    Log-Message "[ATTEMPT $Attempt of $EffectiveMaxRetries] Target: Model=[$($Candidate.Model)] | Agent=[$($Candidate.Agent)]"

    if ($DryRun) {
        Log-Message "[DRY-RUN] Simulating execution of agy with Model=$($Candidate.Model), Agent=$($Candidate.Agent)"
        # Simulate clean exit for dry run
        $Success = $true
        $WinningCandidate = $Candidate
        break
    }

    # Prepare CLI arguments safely
    # agy -p "<Prompt>" --model <Model> --agent <Agent>
    $CliArgs = @("-p", $Prompt, "--model", $Candidate.Model, "--agent", $Candidate.Agent)

    if ($Attempt -gt 1) {
        # When retrying, use --continue if supported to preserve context
        $CliArgs += "--continue"
    }

    Log-Message "[EXEC] $AgyExe $($CliArgs -join ' ')"

    # Run command and capture both stdout and stderr
    $ProcInfo = New-Object System.Diagnostics.ProcessStartInfo
    $ProcInfo.FileName = $AgyExe
    $ProcInfo.Arguments = ($CliArgs | ForEach-Object {
        if ($_ -match '\s|"') { '"{0}"' -f ($_ -replace '"', '\"') } else { $_ }
    }) -join ' '
    $ProcInfo.RedirectStandardOutput = $true
    $ProcInfo.RedirectStandardError = $true
    $ProcInfo.UseShellExecute = $false
    $ProcInfo.CreateNoWindow = $true

    $Proc = New-Object System.Diagnostics.Process
    $Proc.StartInfo = $ProcInfo

    $StdoutBuilder = New-Object System.Text.StringBuilder
    $StderrBuilder = New-Object System.Text.StringBuilder

    $OutHandler = {
        if ($EventArgs.Data) {
            $StdoutBuilder.AppendLine($EventArgs.Data) | Out-Null
            Write-Host $EventArgs.Data
        }
    }
    $ErrHandler = {
        if ($EventArgs.Data) {
            $StderrBuilder.AppendLine($EventArgs.Data) | Out-Null
            Write-Host $EventArgs.Data -ForegroundColor Yellow
        }
    }

    Register-ObjectEvent -InputObject $Proc -EventName "OutputDataReceived" -Action $OutHandler | Out-Null
    Register-ObjectEvent -InputObject $Proc -EventName "ErrorDataReceived" -Action $ErrHandler | Out-Null

    [void]$Proc.Start()
    $Proc.BeginOutputReadLine()
    $Proc.BeginErrorReadLine()
    $Proc.WaitForExit()

    $ExitCode = $Proc.ExitCode
    $FullOutput = $StdoutBuilder.ToString() + "`n" + $StderrBuilder.ToString()

    Add-Content -LiteralPath $SessionLogFile -Value "`n--- OUTPUT ATTEMPT $Attempt ---`n$FullOutput" -Encoding utf8

    # Scan for failover signatures
    $FailureDetected = $false
    $MatchedSignature = ""

    if ($ExitCode -ne 0) {
        $FailureDetected = $true
        $MatchedSignature = "Non-zero exit code: $ExitCode"
    }

    foreach ($Sig in $RetrySignatures) {
        if ($FullOutput -match [regex]::Escape($Sig)) {
            $FailureDetected = $true
            $MatchedSignature = "Signature matched: '$Sig'"
            break
        }
    }

    if (-not $FailureDetected) {
        Log-Message "[SUCCESS] Task executed successfully with Model=[$($Candidate.Model)] and Agent=[$($Candidate.Agent)]."
        $Success = $true
        $WinningCandidate = $Candidate
        break
    } else {
        Log-Message "[FAILOVER TRIGGERED] Attempt $Attempt encountered error condition: $MatchedSignature"
        Log-Message "[ISOLATION] Quarantining Model=[$($Candidate.Model)] | Agent=[$($Candidate.Agent)] for this session."
        $ExcludedKeys[$CandidateKey] = $true
        Start-Sleep -Seconds 2
    }
}

Log-Message "───────────────────────────────────────────────────────────────"
if ($Success) {
    Log-Message "RESULT       : COMPLETED"
    Log-Message "Active Model : $($WinningCandidate.Model)"
    Log-Message "Active Agent : $($WinningCandidate.Agent)"
    Log-Message "Log Location : $SessionLogFile"
    exit 0
} else {
    Log-Message "RESULT       : FAILED (All configured candidate failovers exhausted)"
    Log-Message "Review diagnostic log at: $SessionLogFile"
    exit 1
}

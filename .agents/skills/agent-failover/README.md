# Antigravity Automatic Agent Failover System

## 1. Overview & How It Works

The **Antigravity Agent Failover System** is designed to provide seamless operational continuity during long development sessions, autonomous multi-phase tasks, and continuous coding loops. 

When your active foundation model or Antigravity agent encounters any of the following failure modes:
- **HTTP 429 / Rate Limits** (Token-per-minute or Request-per-minute throttles)
- **Account Quota Exhaustion**
- **HTTP 503 / `UNAVAILABLE`** ("No capacity available for model on the server")
- **Transient Cluster Outages**

The system intercepts the failure signature, isolates the exhausted agent/model pair for the duration of the task to avoid wasteful retry cycles, and immediately re-executes the unfinished objective using the next prioritized agent and model in your configured fallback pool.

---

## 2. Configuration & Editing Agent/Model Priority

The pool configuration is centrally managed in [config.json](config.json).

```json
{
  "enabled": true,
  "agents": [
    "gsd-executor",
    "gsd-code-fixer",
    "code-reviewer",
    "gsd-debugger"
  ],
  "models": [
    "gemini-3.8-flash-high",
    "gemini-3.7-flash-high",
    "claude-sonnet-4-6",
    "gemini-3.1-pro-high",
    "claude-opus-4-6-thinking"
  ],
  "retry_on": [
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
  ],
  "max_retries": 5,
  "preserve_conversation": true,
  "log_dir": "logs"
}
```

### How to Edit Priority:
- **Reorder Models**: The script attempts models in the exact array index order (`models[0]` first, then `models[1]`, etc.). Move your preferred models to the top of the array.
- **Reorder Agents**: The script matches models with agents in `agents` array order.
- **Add Newly Discovered Models**: Run `agy models` to see all models currently available under your account, and paste their IDs directly into the `models` list.
- **Add Newly Discovered Agents**: Run `agy agents` to see available agents and paste their names into the `agents` list.

---

## 3. How to Enable or Disable Failover

- **To Disable**: In [config.json](config.json), set:
  ```json
  "enabled": false
  ```
- **To Enable**: In [config.json](config.json), set:
  ```json
  "enabled": true
  ```

---

## 4. How to Manually Run the Failover Script

You can run any task through the failover wrapper using PowerShell (`pwsh`):

### Basic Task Execution:
```powershell
pwsh -File .agents/skills/agent-failover/scripts/agent-failover.ps1 -Prompt "Review backend API routes and verify schema validation"
```

### With Ad-hoc Model Fallback Overrides:
```powershell
pwsh -File .agents/skills/agent-failover/scripts/agent-failover.ps1 `
  -Prompt "Run test suite and fix any failing unit tests" `
  -Models @("gemini-3.8-flash-high", "claude-sonnet-4-6", "gemini-3.7-flash-high") `
  -Agents @("gsd-executor", "gsd-code-fixer") `
  -MaxRetries 4
```

---

## 5. How to Test the Failover System

A dry-run flag is provided to verify candidate generation, configuration loading, and log recording without consuming token quota:

```powershell
pwsh -File .agents/skills/agent-failover/scripts/agent-failover.ps1 -Prompt "Test failover runner" -DryRun
```

To run a live test with a lightweight instruction:
```powershell
pwsh -File .agents/skills/agent-failover/scripts/agent-failover.ps1 -Prompt "Respond with 'FAILOVER_VERIFIED'"
```

---

## 6. What Happens When All Agents & Models Are Exhausted

If every configured model and agent in the pool encounters rate limits, capacity constraints, or unrecoverable errors:
1. The execution loop halts immediately upon reaching `max_retries` (default: 5).
2. The quarantined agents/models and specific error messages are compiled into a timestamped session log in `.agents/skills/agent-failover/logs/failover-<timestamp>.log`.
3. The script returns an exit code of `1`.
4. A clear diagnostic message is printed to the terminal, detailing each attempted candidate and the reason for refusal, allowing you to easily identify upstream provider outages.
5. Your local files, git working tree, and project code are **never reset or deleted**.

---

## 7. Code Quality Loop with CodeRabbit

Whenever meaningful code changes are implemented through an Antigravity agent:
1. **Implement Changes**: Agent writes clean, minimal diffs.
2. **Run Tests**: Execute `python -m pytest` or `npm test`.
3. **Trigger Review**: Prompt Antigravity with **"Review my code"** or execute `cr review` from the terminal.
4. **Inspect Findings**: CodeRabbit categorizes findings into CRITICAL, WARNING, SUGGESTION, and NITPICK.
5. **Apply Verified Fixes**: Fix verified issues without accepting ambiguous suggestions blindly.
6. **Re-run Tests**: Confirm clean pass status before commit.

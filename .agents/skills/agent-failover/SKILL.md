---
name: agent-failover
description: Automatic agent and model failover system for Antigravity. Detects quota, rate limit, capacity, and model unavailability failures, automatically continuing tasks with the next available configured agent or model while preserving context and safeguarding project files.
---

# Antigravity Agent & Model Failover System

## 1. Overview & Operational Principles

The **Agent Failover System** provides zero-interruption resilience for Antigravity development sessions. When an active AI agent or foundation model encounters rate limits, exhausted quotas, capacity limits, or temporary outages, the system automatically detects the failure condition and transfers execution to the next prioritized agent or model in the configured pool.

### Core Guarantees
- **Autonomous Recovery**: Tasks continue without requiring manual model toggling by the developer.
- **Context Preservation**: Retains the user's original objective, active file state, and intermediate execution artifacts across retries.
- **Zero-Corruption Safety**: File modifications remain strictly non-destructive. Never resets or wipes user workspace files.
- **Loop Prevention**: Tracks failed agents/models per task execution and skips them to avoid infinite retry loops.
- **Configurable Fallback Pool**: Centrally configured via `config.json` using models and agents verified on this machine.

---

## 2. Configured Fallback Pools

All agents and models configured below have been verified on this machine via `agy agents` and `agy models`.

### 2.1 Model Fallback Hierarchy
1. **`gemini-3.8-flash-high`** (Primary Default — High speed & reasoning)
2. **`gemini-3.7-flash-high`** (Secondary — High reasoning capacity)
3. **`claude-sonnet-4-6`** (Tertiary — Deep code analysis & architecture)
4. **`gemini-3.1-pro-high`** (Quaternary — Long-context synthesis)
5. **`claude-opus-4-6-thinking`** (Final Standby — Complex logic fallback)

### 2.2 Agent Fallback Hierarchy
1. **`gsd-executor`** (Primary — Systematic phased implementation & task execution)
2. **`gsd-code-fixer`** (Secondary — Targeted code repair & debugging)
3. **`code-reviewer`** (Tertiary / Review — CodeRabbit AST static review & quality audits)
4. **`gsd-debugger`** (Diagnostic — Forensic error isolation)

---

## 3. Failure Detection Heuristics

The failover system continuously monitors terminal and API outputs for the following error signatures defined in `config.json`:

| Signature Pattern | Error Class | Typical Trigger Cause |
| :--- | :--- | :--- |
| `RESOURCE_EXHAUSTED` / `429` | Quota / Rate Limit | Token-per-minute (TPM) or Request-per-minute (RPM) limit reached |
| `UNAVAILABLE` / `503` | Backend Capacity | "No capacity available for model on the server" |
| `quota` / `rate_limit` | Account Quota | Daily or tier-level quota exhausted |
| `model_unavailable` | Routing Outage | Temporary cluster outage or maintenance window |
| `overloaded` / `Too Many Requests` | Transient Pressure | Upstream provider throttling |

---

## 4. Automatic Handoff Workflow

When an error signature is detected:

```
[Agent/Model Running Task]
            │
            ▼
    [Error Detected?]
      ├── No  ──► [Task Completes Normally]
      └── Yes ──► [Log Error & Mark Agent/Model as Failed]
                        │
                        ▼
            [Remaining Fallbacks Available?]
              ├── No  ──► [Halt with Clear Diagnostic Summary]
              └── Yes ──► [Select Next Configured Candidate]
                                │
                                ▼
                  [Re-invoke Task with --continue / Context]
                                │
                                ▼
                     [Resume Execution Loop]
```

### Handoff Steps:
1. **Capture & Quarantine**: The failed agent/model is recorded in a session exclusion list so it is not re-attempted for the current task.
2. **Context Compilation**: The script synthesizes the original user prompt with the latest execution log tail so the next agent understands what was already accomplished.
3. **Dispatch to Next Candidate**: Calls `agy -p "<PROMPT>" --model <NEXT_MODEL> --agent <NEXT_AGENT>` with `--continue` when safe.
4. **Max Retry Boundary**: Enforces `max_retries` (default: 5) to guarantee termination if all backends are unavailable.

---

## 5. Automated PowerShell Script Interface

The failover engine is implemented in PowerShell at:
`.agents/skills/agent-failover/scripts/agent-failover.ps1`

### Running a Resilient Task
```powershell
pwsh -File .agents/skills/agent-failover/scripts/agent-failover.ps1 -Prompt "Implement the requested feature and run tests"
```

### Overriding Fallback Pool from CLI
```powershell
pwsh -File .agents/skills/agent-failover/scripts/agent-failover.ps1 `
  -Prompt "Refactor backend database models" `
  -Models @("gemini-3.8-flash-high", "claude-sonnet-4-6", "gemini-3.7-flash-high") `
  -Agents @("gsd-executor", "gsd-code-fixer")
```

---

## 6. Development Quality Loop with CodeRabbit

This skill integrates directly with the **CodeRabbit** plugin installed in Antigravity:

```
    ┌───────────────────────────┐
    │     Antigravity Agent     │
    │  (gemini-3.8 / claude)    │
    └─────────────┬─────────────┘
                  │ 1. Implement Changes
                  ▼
    ┌───────────────────────────┐
    │     Run Local Tests       │
    │   (pytest / npm test)     │
    └─────────────┬─────────────┘
                  │ 2. Tests Pass
                  ▼
    ┌───────────────────────────┐
    │     CodeRabbit Review     │
    │  ("Review my code" / cr)  │
    └─────────────┬─────────────┘
                  │ 3. Findings Categorized
                  ▼
    ┌───────────────────────────┐
    │     Fix Valid Findings    │
    │   (Never blind fixes)     │
    └─────────────┬─────────────┘
                  │ 4. Re-run Verification
                  ▼
    ┌───────────────────────────┐
    │       Final Result        │
    └───────────────────────────┘
```

When reviewing:
- In chat: say **"Review my code"** or **"Check my code for bugs and security issues"** to invoke CodeRabbit review standards.
- Via CLI: run `coderabbit review` or `cr review` in any git repository.

# Scout Tester

## STANDARD S1 — Follow `memory/standard-S1-token-efficiency.md`

## Session Startup
1. Read `C:\Users\Connect\.claude\projects\C--Users-Connect\memory\handoff-scout-tester.md` for context
   - ONLY update THIS file, never touch other project handoffs
2. Print the status dashboard, then **ask the user what to do**
3. NEVER auto-execute anything from handoff — it's context only

## Handoff (MANDATORY MICRO-SAVE — NON-NEGOTIABLE)
**Auto-save every 10 tool calls.** Also save before multi-step tasks, after user decisions, and at session end. NEVER wait for the user to ask. Write facts only. See root CLAUDE.md "Memory & Persistence" for full rules.

## Quick Ref
- **Port:** 3004, start with `start.bat`
- **Stack:** Express, Scout API, SSE dashboard
- **Key files:** `server.js`, `index.html`, `data/sites.json` (75 sites), `data/results.json`
- **Scout API:** 30s gap, FR/DE/GB only, never parallel

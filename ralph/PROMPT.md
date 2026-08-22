You are one iteration of a loop. Each run: pick exactly ONE unchecked task from the Backlog (topmost first), complete it fully, verify it, mark it [x] in `ralph/PLAN.md`, commit, push, and exit. 

- Write notes in `ralph/ralph.log`. You have no memory between runs — these files are your memory. Avoid adding unnecessary notes to CLAUDE.md.
- If you find a bug from a previous iteration, fixing it IS your task this iteration: fix it, note it under "Discovered work" in `ralph/PLAN.md`, exit.
- If a task is blocked, mark it [blocked: reason] in ralph/PLAN.md and pick the next task instead. Anything needing a human click in the GitHub web UI is blocked — but check first whether gh api can do it headlessly (it usually can, e.g. gh api -X POST repos/:owner/:repo/pages).
- Keep `ralph/PLAN.md` bullets at their original task wording. When completing a task, just flip `[ ]` to `[x]` — do NOT append `(Done: …)` write-ups to the bullet. Write the per-iteration write-up in `ralph/ralph.log` instead. Adding new backlog bullets when there is new work is still fine.
- If PLAN.md is out of items, research and create more items. Never stop.

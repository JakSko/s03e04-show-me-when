---
id: SCHED-4513
title: Board refreshes itself
status: done
plan: R4
---

Today the board only changes when someone reloads the page. Refresh it every 2 seconds while it is open
(`fetchIncidents()` hands back what is current).

Acceptance: leave the board open; it stays current without a reload.

## Closed

```
done: board refreshes every 2 s through fetchIncidents(), never two requests at once
worker: claude-code · claude-opus-5-5 · high
commit: 71a70ac
```

Checked by the main session: Playwright suite green at 748e70c (19 passed, twice), mocked API; live check follows the deploy.

---
id: SCHED-4512
title: Loader until incidents load
status: done
plan: R3
---

The board is blank until the first answer comes back. Show a loader (`data-testid="loader"`) until
incidents load, then the list.

Acceptance: a loader shows on open and is gone once the incidents are on screen.

## Closed

```
done: loader in the HTML until incidents load; empty state; first-load error that retries on the next refresh
worker: claude-code · claude-opus-5-5 · high
commit: 6d29d05
```

Checked by the main session: Playwright suite green at 748e70c (19 passed, twice), mocked API; live check follows the deploy.

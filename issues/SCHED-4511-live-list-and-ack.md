---
id: SCHED-4511
title: Live list with Ack per row
status: done
plan: R1, R2
---

On-call needs to see new incidents the moment they come in and take one with a click.

- New incidents appear at the top of the list as they arrive, newest first (R1).
- Each row gets an **Ack** button (`data-testid="ack"`). Clicking it calls `api.ack(id)` and marks the row
  acked (`data-testid="acked"`) (R2).

Acceptance: a new incident shows at the top without a reload; Ack on a row acks that incident.

## Closed

```
done: rows merged by id, newest first, rendered as text; Ack per row calls api.ack(id) once and shows the acked mark or an error
worker: claude-code · claude-opus-5-5 · high
commit: 8b55a37
```

Checked by the main session: Playwright suite green at 748e70c (19 passed, twice), mocked API; live check follows the deploy.

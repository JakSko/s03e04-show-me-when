---
id: SCHED-4514
title: Times in the viewer's local time
status: done
plan: R5
---

Follow-up to #4471. The board prints raw UTC (`2026-11-12T03:03:00.000Z`). On-call reads it in their own
time zone and gets it wrong.

- Show each incident's time in the viewer's local time.
- Day before month for EU locales (dd/mm); keep the full UTC value in the `<time datetime>` attribute.

Acceptance: a viewer in Auckland and one in Berlin each see the time in their own zone, in their own order.

## Closed

```
done: times in the viewer's locale and time zone via Intl; <time datetime> keeps the full UTC value
worker: claude-code · claude-opus-5-5 · high
commit: c0b7578
```

Checked by the main session: Playwright suite green at 748e70c (19 passed, twice), mocked API; live check follows the deploy.

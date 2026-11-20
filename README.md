# sched-prod incident board (S03E04 "show me when")

An on-call incident board: one static page that lists tonight's incidents, newest first, lets on-call ack one, and stays current without a reload. Built for the MEGA.dev Challenge S03E04 "show me when" (solved 2026-11-19).

The plan, the four issues, `app/api.js`, `app/config.js` and `.github/workflows/prove.yml` came with the course's starter. Everything else here is mine, written with my coding agent (Claude Code).

## The task, in my words

Build the starter's four ready issues (a live list with an Ack per row, a loader, a refresh every two seconds, times in the viewer's own time zone), deploy the board to my own https address, record it in use, and send product a short report with the evidence. Product reads it and decides what changes. Then build that decision, deploy it, record it again, and let the course's replay prove the new build.

The trap was not in the code. A test clicks only when the page holds still. A person clicks while new incidents keep landing, and on this board every new incident pushed the rows down, so a click aimed at one incident could ack another. Only a recording of a person showed it.

## What I built

### The board (`app/`)

- [`app/app.js`](app/app.js): rows are merged by id and kept in place, so a refresh updates them instead of redrawing the list, and the acked mark survives every refresh. Incident text is rendered as text, never as HTML. One click sends one ack; a failed ack shows an error in its row. Times use the browser's own locale and time zone, and `<time datetime>` keeps the full UTC value.
- After product's decision: the list holds still while it is on screen. New incidents wait in an "N new" bar (`data-testid="new-bar"`) and come in at the top only when on-call clicks it. The bar keeps its space even when it is empty, so its showing up never moves a row.
- The build names itself: the deploy writes the commit sha into `<meta name="build">` and the footer.

### Tests first (`tests/`)

- [`tests/board.spec.mjs`](tests/board.spec.mjs): 23 Playwright tests against a fake incident API (invented incidents; every request that leaves the machine is blocked; `/ack` is answered locally). They cover the plan's six requirements and all its hooks, three locales (en-NZ in Auckland, de-DE in Berlin, en-US in New York), and the race: the mouse rests on an Ack button, a new incident lands, and the click must still ack the incident it aimed at.
- [`tests/live.spec.mjs`](tests/live.spec.mjs): a smoke run against the deployed board, live reads only, the ack answered locally.
- Each change was red first: the suite failed on the starter, and the decision's tests failed on the build before it.

### A deploy that refuses (`scripts/`)

- [`scripts/build_deploy.mjs`](scripts/build_deploy.mjs): refuses on any uncommitted change; builds the deploy folder from the committed `app/` only, outside the repo; stamps the full sha; runs the whole suite on that exact folder; writes a gate file with the result and a hash of the folder.
- [`scripts/win-deploy.ps1`](scripts/win-deploy.ps1): refuses unless the gate passed for the current commit, the folder is unchanged since, GitHub's `main` is that commit and the host is linked to the right project. Then it deploys and reads the sha back from the live page.
- Checked by breaking it: a deliberately red build, an uncommitted change and a file changed after the gate were each refused.

## How it was checked

- The suite: red on the starter (19 failed), green on each build; the decision's tests red before the change (6 failed) and green after (22 passed).
- After each deploy: the live page served the intended commit (meta and footer equal to `HEAD` and GitHub `main`), every file was byte-equal to the local build when fetched like a stranger, and the live smoke run passed.
- The course's replay ran on GitHub Actions with the unchanged `prove.yml` against the deployed decision build: three attempts, each ack went to the incident aimed at.

## What went wrong, and what I changed

- I read the gaps between incident timestamps as the arrival rate and planned for one new incident every seven minutes. In the browser they came every few seconds. The plan changed, and so did each recording: a minute, not fifteen.
- The first recording showed a correct ack two seconds after the rows had moved, and the course refused it: nothing had landed near the click. The second recording clicked as incidents landed, and the board acked the incident that slid under the pointer, not the one aimed at.
- The report then had to name both: the incident meant and the incident that got the ack.
- My screen recordings showed private things around the board (search history, other windows, bookmarks). Each public copy was cut and masked before upload.

## Run it

```bash
npm install
npx playwright install chromium
npx playwright test                 # the suite, against app/ with a fake API
```

To run the board itself it needs the course's incident API and a session, which only the course hands out: copy `app/config.js` outside git, fill in `API` and `SESSION`, and serve it (`npm run serve`). The deploy scripts expect the same values as files and a Railway project; see the header of each script.

## How this repo is set up

- [`AGENTS.md`](AGENTS.md): how work moves here (plan, issues as files, one commit per issue, closing comments) and the rules (no session in git, hooks pinned, `prove.yml` unchanged). `CLAUDE.md` points Claude Code at it.
- [`plan.md`](plan.md): the plan, with R1 changed as product decided after step one.
- [`issues/`](issues/): the four issues, each closed with a closing comment that names the commit.

# Timeline: 032-fork-folio-restore

**Total measured (leaf spans):** 7h40m54s · **Retries:** 0 · **Open spans:** 3 ⏱ still running

## By kind

- **phase** — 10m43s across 2 span(s)
- **task** — 7h40m54s across 10 span(s)
- **wave** — 8h51m38s across 3 span(s)

## Slowest

- `W2` (wave) — wave 2 — **6h31m03s**
- `T7` (task) — Guards flipped, tests adapted, docs part 1 — **6h17m35s**
- `W1` (wave) — wave 1 — **1h12m48s**

## Spans

| Span                | Kind  | Label                                      | Model        | Attempt | Status | Duration        |
| ------------------- | ----- | ------------------------------------------ | ------------ | ------- | ------ | --------------- |
| `propose`           | phase | propose                                    | -            | -       | ok     | 1m18s           |
| `plan`              | phase | plan                                       | -            | -       | ok     | 9m25s           |
| `W1`                | wave  | wave 1                                     | -            | -       | ok     | 1h12m48s        |
| `T1`                | task  | Delete the company deploy workflow         | orchestrator | 1       | ok     | 13s             |
| `T2`                | task  | Fork stack and preflight                   | sonnet       | 1       | ok     | 15m55s          |
| `T3`                | task  | Fork docs and identity guard               | sonnet       | 1       | ok     | 10m46s          |
| `T4`                | -     | -                                          | -            | -       | ok     | ⏱ still running |
| `W2`                | wave  | wave 2                                     | -            | -       | ok     | 6h31m03s        |
| `T5`                | task  | Folio foundation                           | sonnet       | 1       | ok     | 7m14s           |
| `T6`                | task  | Restore the other 021-only screens         | orchestrator | 1       | ok     | 4m32s           |
| `T7`                | task  | Guards flipped, tests adapted, docs part 1 | sonnet       | 1       | ok     | 6h17m35s        |
| `W3`                | wave  | wave 3                                     | -            | -       | ok     | 1h07m47s        |
| `T8`                | task  | G1 draft page                              | sonnet       | 1       | ok     | 17m35s          |
| `T9`                | task  | G2 create flow and shell                   | sonnet       | 1       | ok     | 10m08s          |
| `T10`               | task  | G3 campaigns, projects, kits               | sonnet       | 1       | ok     | 8m49s           |
| `T11`               | task  | G4 team, settings, admin, insights         | sonnet       | 1       | ok     | 8m07s           |
| `T12`               | -     | -                                          | -            | -       | ok     | ⏱ still running |
| `verify-1793093205` | phase | verify                                     | -            | -       | -      | ⏱ still running |

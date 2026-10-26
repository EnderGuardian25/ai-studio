# Carry-overs for T19 (docs), collected by the orchestrator

- **T4 review NOTE (known limit):** when the personal image key fails and the team provider's retry also fails, the result is a plain `PROVIDER_ERROR` skip with no `imageSource`, so the draft does not record that the user's key failed (`src/lib/agent/background.ts`, `generateWithFallback`). FR-13 does not cover this case. List it in the handoff 031 known limits.
- **T3:** W-28 (Admin nav split) and W-36 (Headline panel position) were left as layout questions; W-14 was dropped (in `src/acp`, frozen by NFR-04).
- **CI:** the T2 push run (40324807659) failed on one render-harness Chromium launch timeout (`WS endpoint`), not on a code change.
- **T6:** `catalogue.json` is 263,944 bytes, against the NFR-09 target of 250 KB (1950 families, one per line; a field cannot be dropped under FR-16). `catalogue.ts` has no `import 'server-only'` (absent package; the MCP and scheduler runtimes would crash); `fontsBoundary.test.ts` guards it instead. The FONT artifact upload (`artifacts/route.ts:126`) writes `fonts` without the 6-entry cap. AC-16: the old and new Instrument Serif URLs both returned 200.

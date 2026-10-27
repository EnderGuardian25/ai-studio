# 033 audit register

Baselines: `9f829456` (Folio) and `c45ed3dc` (the 018–031 tip, behaviour frozen).

Counts: none yet (T4 fills the rows). By class: look 0, behaviour 0, ambiguous 0, none 0. By family: G1 0, G2 0, G3 0, G4 0.

Columns:

- **ID**: `A-001` upward, never reused.
- **File**: path from the repo root, as in `AUDIT_SET` of `scripts/lib/uiInvariants.mjs`.
- **Element**: the JSX element or line range at `c45ed3dc`.
- **Class**: `look`, `behaviour`, `ambiguous` or `none`.
- **Reference**: `9f829456:<file>:<line>` or `DS §x.y`; for `behaviour`, the change and the proposal or spec line that names the arrangement.
- **Fix**: what changes (`look`), the question (`ambiguous`), or `—`.
- **Permits**: one markdown code span per token, `` `-<file>:<attr>=<value>` `` or `` `+<file>:<attr>=<value>` ``, separated by spaces, or `—`. The file must be one the key was removed from (or added to). A value holding a backtick uses a double-backtick span with a space of padding: ``` `` -f.tsx:id=`x-${i}` `` ```. Write a pipe in a cell as `\|`: for `href={a || b}` write `` `-f.tsx:href=a \|\| b` ``.
- **Status**: `proposed` (T4), `approved` / `cut` (the checkpoint), `closed <sha>` (W2), `behaviour` (kept).

## G1 Draft page

| ID  | File | Element | Class | Reference | Fix | Permits | Status |
| --- | ---- | ------- | ----- | --------- | --- | ------- | ------ |

## G2 Create flow, shell

| ID  | File | Element | Class | Reference | Fix | Permits | Status |
| --- | ---- | ------- | ----- | --------- | --- | ------- | ------ |

## G3 Campaigns, kits

| ID  | File | Element | Class | Reference | Fix | Permits | Status |
| --- | ---- | ------- | ----- | --------- | --- | ------- | ------ |

## G4 Team, settings, admin

| ID  | File | Element | Class | Reference | Fix | Permits | Status |
| --- | ---- | ------- | ----- | --------- | --- | ------- | ------ |

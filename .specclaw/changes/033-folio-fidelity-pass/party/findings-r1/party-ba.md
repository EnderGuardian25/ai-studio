### [WARN] party-ba — "Not yet the Folio the user picked" is asserted, with no falsifiable acceptance criterion

**Quotes:**

> the app is not yet the Folio the user picked on 2026-10-07
> A full `ui-captures/033/` set for the user's review, which is the acceptance for the look.
> **Problem:** The main goal is fidelity to Folio. The only acceptance for the look is the user eyeballing captures, so no observation can make it fail. The proposal has no measurable done-state, such as zero unresolved "look" rows in the audit or a count of deviations from DESIGN_SYSTEM.md. The same user ruled on the 032 captures and then asked for this change, so "reviewed" is not shown to mean "faithful". The user already reviewed and verified 032 as PASS, so the proposal does not say what that review missed.
> **Fix:** Add a criterion that can fail, for example: every audit row is classified, every "look" row is closed or ruled on, and each §8.20–§8.27 element has a matching capture. State which gaps the 032 review missed.
> **Status:** upheld

### [WARN] party-ba — "About 60" screens and "12 new components" are unsourced counts that set scope

**Quotes:**

> About 60 Folio-era screens and components changed in 018–031, and none of them was compared against its Folio version for markup.
> Files affected:** about 70 (estimated)
> They are the insights page and its parts, the post style picker, the script font picker, the three draft-page notices, the caption route card and the rule review panel.
> **Problem:** The 60 figure is asserted with no source such as a diff command. The 12 is also unreliable. The list names "the insights page and its parts" (plural, uncounted), and the other named items add up to 1+1+1+3+1+1 = 8 before the "parts". The "none of them was compared" claim also sits against 032, which restyled these same screens. The Open Questions admit the look/behaviour split is unknown, so the 70-file figure rests on two unverified quantities.
> **Fix:** Derive the counts from `git diff --stat 9f829456..HEAD` over the stated directories and list the 12 by name. Or drop the numbers and let the audit's first task set scope.
> **Status:** upheld

### [WARN] party-ba — "Look" versus "behaviour" is the load-bearing distinction and is left undefined at the edges

**Quotes:**

> **look**, which returns to Folio (structure of sections, rules, numbering, labels, type, spacing, cards or badges Folio did not use)
> Markup and visible text may now change; behaviour may not.
> Where a 018–031 change rearranged a screen on purpose, the new arrangement stays and only its look returns to Folio.
> **Problem:** "Structure of sections" and "labels" are listed as look. Rule 3 says a deliberate arrangement stays, and "a deliberate 018–031 arrangement" is itself listed as behaviour. Removing the sections or cards that a feature introduced (such as a notice or a card) is both. Two readings give two builds. One treats structure as look and strips 018–031 sections. The other keeps them and only restyles. The proposal pushes the ambiguous cases to the spec, but no tie-break rule is given for deciding what counts as "deliberate". Where the user rules on a row, that ruling is the acceptance, and the criteria give no way to check it.
> **Fix:** Define "deliberate" (for example, introduced by a named change with its own spec) and give a default for ambiguous rows.
> **Status:** upheld

### [NOTE] party-ba — "Folio showed the word Send" and crop marks rest on a prior-version recollection

**Quotes:**

> Show the word "Send" in the assistant drawers' Send buttons, as Folio did (`aria-label="Send"` stays).
> **Problem:** The proposal cites `9f829456` as the source for the crop marks, but gives no source for the Send claim. The 032 follow-ups listed these as items "for the user to decide", so the user's want is probably real. The proposal does not say whether the user chose these three items or the agent inferred them. It also assumes the word Send fits the drawer layout, and that the §12 glossary allows it.
> **Fix:** Cite the Folio file and line for Send, and note the user's decision.
> **Status:** upheld

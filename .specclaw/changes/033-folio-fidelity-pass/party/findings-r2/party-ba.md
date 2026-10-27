### [WARN] party-ba — "Not yet the Folio the user picked" is asserted, with no falsifiable acceptance criterion

**Quotes:**

> the app is not yet the Folio the user picked on 2026-10-07
> A full `ui-captures/033/` set for the user's review, which is the acceptance for the look.
> **Problem:** The main goal is fidelity to Folio, but the only acceptance for the look is the user viewing captures. No observation can make that fail. The proposal gives no measurable done-state. It also does not say what the 032 review missed. Round-1 findings from party-architect support this: the audit table has no defined shape, so "every audit row closed" cannot serve as the criterion yet.
> **Fix:** Add criteria that can fail. Every audit row is classified. Every look row is closed or ruled on by the user. Each §8.20–§8.27 element has a matching capture. State which gaps the 032 review missed.
> **Status:** upheld

### [WARN] party-ba — "About 60" screens and "12 new components" are unsourced counts that set scope

**Quotes:**

> About 60 Folio-era screens and components changed in 018–031, and none of them was compared against its Folio version for markup.
> Files affected:** about 70 (estimated)
> They are the insights page and its parts, the post style picker, the script font picker, the three draft-page notices, the caption route card and the rule review panel.
> **Problem:** The 60 figure is asserted with no source such as a diff command. The 12 is not reproducible from the text, because the named items sum to 8 before "its parts". party-architect's NOTE on enumerability agrees. The 70-file estimate rests on these two unverified quantities.
> **Fix:** Derive the counts from `git diff --stat 9f829456..HEAD` over the stated directories and list the 12 by path. Or drop the numbers and let the audit's first task set scope.
> **Status:** upheld

### [WARN] party-ba — "Look" versus "behaviour" is the load-bearing distinction and is left undefined at the edges

**Quotes:**

> **look**, which returns to Folio (structure of sections, rules, numbering, labels, type, spacing, cards or badges Folio did not use)
> Markup and visible text may now change; behaviour may not.
> Where a 018–031 change rearranged a screen on purpose, the new arrangement stays and only its look returns to Folio.
> **Problem:** "Structure of sections" is listed as look, but "a deliberate 018–031 arrangement" is listed as behaviour. A section or card that a feature introduced is both. One reading strips the 018–031 sections. The other keeps them and only restyles. These give two different builds. No tie-break defines "deliberate". party-architect's finding that the table has no third "ambiguous" class bears on the same gap.
> **Fix:** Define "deliberate", for example introduced by a named change with its own spec. Give a default for ambiguous rows.
> **Status:** upheld

### [NOTE] party-ba — "Folio showed the word Send" and crop marks rest on a prior-version recollection

**Quotes:**

> Show the word "Send" in the assistant drawers' Send buttons, as Folio did (`aria-label="Send"` stays).
> **Problem:** The proposal cites `9f829456` for the crop marks but gives no source for the Send claim. The 032 follow-ups list these items as "for the user to decide". The proposal does not say whether the user chose them. It also does not say whether the word fits the drawer layout or the §12 glossary.
> **Fix:** Cite the Folio file and line for Send, and record the user's decision.
> **Status:** upheld

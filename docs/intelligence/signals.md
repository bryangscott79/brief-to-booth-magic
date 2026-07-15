# Learning Signals

Every row below is a user action that encodes judgment. Status: ✅ captured as durable data · 🟡 state exists but no event history · ⬜ discarded today.

| Signal | Where it fires | What it teaches | Status |
|---|---|---|---|
| Brand pull / brand-book extraction | `deep-dive-brand` → intelligence entries | Baseline brand system | ✅ entries w/ confidence |
| Gap answers (venue, hex, hanging) | Review step → `applyGapAnswer` | Ground-truth corrections to parsing | 🟡 merged into brief, no event |
| Element regeneration + feedback text | ElementDashboard → `generate-element` (`feedback` param) | What the concept got wrong, in the user's words | ⬜ feedback discarded after use |
| Hero version approved vs. regenerated | PromptGenerator save/version flow | Which render direction won | 🟡 versions kept, choice not evented |
| **Hanging refine feedback** | `HangingElementCheck` → refine instruction | Structured design critique (“thinner ring, brushed aluminum”) | 🟡 in prompt_artifacts of the new version |
| Hanging approval | `handleApproveHanging` → `prompt_artifacts.hangingApproved` | The approved suspended-element spec | ✅ on the image row |
| Featured-render selection for deck | Export deck pre-flight | Which images represent the project | ⬜ |
| Deck register choice (Pitch/Executive/…) | Export | Client presentation taste | ⬜ |
| Materials edited in Spatial | SpatialPlanner materialsAndMood | Real material preferences vs. generated | ⬜ |
| Final budget vs. estimate | Pricing / budgetLogic | Estimate calibration per client & venue | ⬜ |
| Project-close learnings | `extract-learnings` + SaveLearningsButton | Distilled lessons → intelligence entries | ✅ (manual trigger only) |

**Phase 1 rule of thumb:** at each 🟡/⬜ moment, write one `learning_events` row at the
same call site that already mutates state. Payloads reference existing artifacts
(image ids, version ids, prompt_artifacts) rather than duplicating them.

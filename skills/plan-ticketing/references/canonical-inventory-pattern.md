# Canonical Inventory Pattern

This file is the structural source of truth for inventory documents. Existing project inventory documents are useful examples and observed facts, but this file defines the preferred shape for new inventory docs.

## Purpose

Use an inventory document when the work needs long-lived investigation memory rather than an implementation plan or ticket breakdown.

Inventories are best for:

- code path inventories,
- schema/table/field inventories,
- route, SQL, or helper decision maps,
- policy-to-code alignment matrices,
- read/write path maps,
- bug-suspect registers,
- baseline-vs-staged caveats,
- evidence-heavy implementation context that future Codex sessions should not rediscover.

Do not use an inventory as a substitute for:

- a plan that records selected architecture and open questions,
- a ticket document that tracks implementation progress,
- release notes or user-facing docs.

## Naming

For cross-repo or multi-module investigation work, create the inventory in the most specific existing docs directory for the target domain:

```text
docs/{domain_or_feature}/{NN}_{slug}_inventory.md
```

For a feature that also has a new plan/ticket pair, place the inventory after the adjacent pair:

```text
docs/{domain_or_feature}/{NN}_{slug}_plan.md
docs/{domain_or_feature}/{NN+1}_{slug}_tickets.md
docs/{domain_or_feature}/{NN+2}_{slug}_inventory.md
```

If the project already has a numbered docs convention, follow that convention.

## Canonical Order

```md
# {Feature or Topic} 인벤토리

작성일: YYYY-MM-DD
수정일: YYYY-MM-DD

## 영향 범위
## 연결 문서
## 목적
## 조사 기준
## 분류 기준
## 결론 요약
## {Primary Matrix or Map}
## {Repository / Route / Table Details}
## Bug-Suspect Register
## Baseline vs Staged Caveat
## Immediate Conclusions
```

Rules:

- Use "영향 범위" or "Scope" to name target repositories and reference repositories explicitly.
- Use "연결 문서" for plan/ticket references when the inventory supports an implementation stream.
- Use "조사 기준" to record exact files, commands, search terms, branches, dumps, or policy documents inspected.
- Use "분류 기준" when rows are classified. Define labels before using them.
- Use "결론 요약" for the short decision-oriented summary.
- Use matrices for broad comparisons, and repository/route/table sections for evidence details.
- Keep "Bug-Suspect Register" only when there are concrete bug candidates or parity gaps.
- Keep "Baseline vs Staged Caveat" when working trees contain staged/uncommitted changes or when baseline and draft patches differ.
- Keep "Immediate Conclusions" concise and actionable.

## Evidence Expectations

- Include exact route names, SQL filenames, helper names, model/table/column names, and file paths when known.
- Include line numbers only when they were observed and likely to stay useful.
- Distinguish observed code facts from policy interpretation.
- Label assumptions and caveats explicitly.
- Do not mark implementation complete in an inventory. Completion belongs in tickets.

## Example Inventory Documents

Inspect only the examples relevant to the current task:

- Existing policy-to-code alignment inventories for matrix shape, repository inventory, and status glossary.
- Existing schema or field inventories for key guardrails and baseline caveats.
- Existing route, helper, or SQL decision inventories for decision ladders, CRUD anchors, and bug-suspect registers.

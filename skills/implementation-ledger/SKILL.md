---
name: implementation-ledger
description: Write and maintain Alpha Kanban-compatible work records for user participation. Use for requested plans, tickets, investigation records, or progress updates to tracked work. Keep discussion-only requests read-only.
---

# Implementation Ledger

Help the user understand what will happen, what changed, how it was checked, and where their decision matters. Agent continuity is a secondary benefit.

## Follow the Request

- **Discuss**: Read relevant records and answer; leave documents unchanged.
- **Create**: A request to write or revise records authorizes that work without another confirmation. Implementation needs its own authorization.
- **Execute**: Carry out authorized work and update its existing ledger as outcomes change.

User instructions and existing authorization take precedence. Invocation alone does not expand scope. Preserve legacy documents unless restructuring is requested.

## Confirm Intent Before Finalizing Scope

Separate observed facts, established user direction, agent assumptions, and missing user context before finalizing a plan or affected ticket. Read relevant evidence and prior direction first. Keep a document-level `확인·결정이 필요한 사항` section in plans, ticket documents, and inventories, including ticket-only workflows. Reuse an existing equivalent heading such as `Open Questions` rather than adding a duplicate. This section elicits knowledge or intent the user may hold so that tickets do not encode the wrong requirements; it is not a list of every unknown.

- Ask when the answer could materially change the goal, scope, or acceptance criteria and cannot reasonably be established by in-scope investigation. Existing equipment, intended usage, and unstated preferences can qualify; a question need not require a choice.
- State the actual question, current understanding or proposed assumption, and how the answer would affect the plan or tickets. Offer options and a recommendation only for genuine choices. Do not manufacture questions to fill the section.
- Put settled requirements in scope and engineering research, benchmarks, and test preparation in planned work or verification. Do not present them as pending user decisions. When no qualifying questions remain after review, retain the heading and write `- 없음`; do not leave it blank, delete it, or use `없음` for questions not yet reviewed.
- Keep answer-dependent scope explicitly provisional; continue independent authorized work. During authorized record updates, reconcile answers into the plan and affected ticket fields, preserve durable user direction once, and remove resolved items from the pending list. An answer alone does not authorize implementation.

## Keep the Record Small

Default to one ticket document for tracked delivery. Add a plan for shared decisions or an inventory for substantial reusable evidence only when it needs a separate home. Tickets own progress; update supporting documents only when their decisions or evidence change.

Make each ticket a change the user can understand and review. Split for independent outcomes or delivery boundaries; keep routine implementation steps inside the ticket. Read current fields and the latest relevant user directions for the selected ticket before relying on old completion notes; expand into other history or evidence only to answer a concrete question. Skip completed tickets outside the selected scope unless a dependency, regression, or newer relevant direction makes them relevant. Use targeted search and bounded reads.

## Write for Participation

Lead with observable behavior and its purpose, then the technical detail needed to assess scope or verification. Existing scope fields already record the plan; add a start note only when new information matters. Do not invent a prior plan after implementation.

Keep scope and acceptance fields current. Preserve durable user direction in `사용자 지시`; put planned work, results, evidence, and remaining actions in `진행 메모`. Do not duplicate directions already recorded by Alpha Kanban. A useful note explains the outcome, what verification establishes, and any next action or decision. Distinguish implementation, testing, user review, and deployment where relevant.

For user-applied status changes and `[수동지시]` records, follow [User Direction Records](references/ledger-format.md#user-direction-records). A user's DONE is not agent verification, and stored directions are not an automatic execution queue.

Normally update once when handing work back. Write earlier for changed user direction, a blocker, or an outcome the user needs during a long task. Omit tool-call diaries, retries, raw logs, and repeated summaries. Link detailed evidence once.

## Preserve Alpha Kanban Compatibility

Before the first ticket write, read [the format reference](references/ledger-format.md). For new files, use only the matching template under `assets/`. Replace placeholders and omit empty optional sections; retain ticket fields and the required question section. Exact suffixes are `_tickets.md`, `_plan.md`, and `_inventory.md`; follow local directory/numbering conventions and share a slug across related files.

Patch the inspected ticket range, re-read the change, and validate after the related edits:

```sh
node <skill-directory>/scripts/check-ledger.mjs <ticket-file>
```

Use `--legacy` only as described in the reference. Choose implementation checks proportional to the change. Format validation establishes structure, not implementation success or visual rendering.

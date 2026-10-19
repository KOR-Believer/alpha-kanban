import type { TicketProgress, TicketStatus } from "@alpha-kanban/shared";

export type TranslateDemo = (key: string) => string;
export type DemoDocument = "plan" | "tickets";
export type DemoTicket = {
  id: string; status: TicketStatus; progress: TicketProgress;
  title: string; scope: string; note: string;
  acceptance: readonly (readonly [boolean, string])[];
  checks: readonly (readonly [boolean, string])[];
  decision: string; result: string;
};
export type DemoMessage = {
  role: "human" | "codex"; text: string; kind?: string;
  attachments?: boolean; loop?: boolean;
};

// Approved fictional story; board, snapshots and copyable requests share these records.
export const READING_DEMO = [
  {
    "id": "READ-03",
    "status": "TODO",
    "progress": 0,
    "title": "Edit and delete book records",
    "scope": "Edit title, author, and reading status; confirm before deleting a record.",
    "note": "Agreed feature · Awaiting implementation",
    "acceptance": [
      [
        false,
        "Changes are saved and deletion requires confirmation."
      ]
    ],
    "checks": [
      [
        false,
        "Verify saving edits and confirming or canceling deletion."
      ]
    ],
    "decision": "Allow editing book records and ask before deleting them.",
    "result": "Scope is agreed in the plan. Implementation and verification are pending."
  },
  {
    "id": "READ-04",
    "status": "READY",
    "progress": 25,
    "title": "Add book sorting controls",
    "scope": "Choose title or recently recorded order. Preserve active filters.",
    "note": "Scope agreed · Title / recently recorded",
    "acceptance": [
      [
        false,
        "Changing sort preserves search and filters."
      ]
    ],
    "checks": [
      [
        false,
        "Check both sort orders with filtering."
      ]
    ],
    "decision": "Use recently recorded order by default.",
    "result": "Agreed on scope and default order. Implementation and completion checks have not started."
  },
  {
    "id": "READ-02",
    "status": "IN_PROGRESS",
    "progress": 75,
    "title": "Read-books filter and title search",
    "scope": "Combine both conditions and show an empty state. Do not persist the filter across visits.",
    "note": "Layout revised · Mobile check pending",
    "acceptance": [
      [
        true,
        "Title search and read-books filtering work together."
      ],
      [
        false,
        "Place the filter below the search field on narrow screens."
      ]
    ],
    "checks": [
      [
        true,
        "Ran combined-filter and empty-result tests."
      ],
      [
        false,
        "Check title and button layout at 390px."
      ]
    ],
    "decision": "The plan’s questions were discussed: keep filters for this visit and exclude note search. The user reviewed these decisions in the updated plan and tickets before requesting implementation. On reviewing the result, they asked to move the filter below search on phones.",
    "result": "Implemented the agreed filter, search, and empty state; combined-filter and empty-result tests passed. Added the later feedback to this ticket’s acceptance criteria. Mobile layout was adjusted; device rechecking remains; keep IN_PROGRESS at 75%."
  },
  {
    "id": "READ-01",
    "status": "DONE",
    "progress": 100,
    "title": "Define book record fields",
    "scope": "Record title, author, and reading status.",
    "note": "Reviewed · Fields matched to sample",
    "acceptance": [
      [
        true,
        "Required book record fields are defined."
      ]
    ],
    "checks": [
      [
        true,
        "Compared the sample record with required fields."
      ]
    ],
    "decision": "Start with title, author, and reading status.",
    "result": "Defined the fields and compared them with the sample record. Completed the agreed document review."
  }
] as const satisfies readonly DemoTicket[];

export const INTRO_MESSAGES = [
  {
    "role": "human",
    "text": "Use $implementation-ledger. I want to build a reading journal app. Do not write documents or code yet; let’s discuss the features and direction first.",
    "kind": "discuss"
  },
  {
    "role": "codex",
    "text": "What would you like to record, and how would you find it later?"
  },
  {
    "role": "human",
    "text": "Title, author, and reading status. I’d also like a read-books filter and title search."
  },
  {
    "role": "codex",
    "text": "Let’s combine search and filtering. Shall we also include editing, confirmed deletion, and title/recent sorting, with recent first?"
  },
  {
    "role": "human",
    "text": "Yes, that direction works. Ask before deleting a record."
  },
  {
    "role": "human",
    "text": "Draft a plan and tickets based on our conversation so far. Do not implement yet.",
    "kind": "draft"
  },
  {
    "role": "codex",
    "text": "The plan and ticket drafts are ready. Nothing has been implemented. Please read both documents to review the scope and remaining questions.",
    "attachments": true
  },
  {
    "role": "human",
    "text": "I’ve read the plan. There are two open questions. Explain them one at a time so we can discuss what changes with each answer.",
    "kind": "clarify"
  },
  {
    "role": "codex",
    "text": "Saving the filter across visits restores the same view. Keeping it only for this visit means reopening the app shows all books. Which do you prefer?"
  },
  {
    "role": "human",
    "text": "Keep the filter only for this visit. Show all books when I return."
  },
  {
    "role": "codex",
    "text": "Searching notes expands both the search scope and result criteria. Shall we focus on title search this time?"
  },
  {
    "role": "human",
    "text": "Yes. Exclude note search from this implementation."
  },
  {
    "role": "human",
    "text": "Reflect the decisions we just made in the plan and tickets. I’ll read them again and check.",
    "kind": "update-docs"
  },
  {
    "role": "codex",
    "text": "I’ve reflected the decisions in the plan and tickets: filters last for this visit, and note search is excluded. Acceptance criteria are updated. The questions section remains and now says “None.”",
    "attachments": true
  },
  {
    "role": "human",
    "text": "I’ve reread the updated documents. The agreed scope and exclusions are reflected correctly."
  },
  {
    "role": "codex",
    "text": "Good. If reading brings up more questions, we can discuss them again. I’ll wait for your implementation request.",
    "loop": true
  },
  {
    "role": "human",
    "text": "I’ve reviewed the plan and tickets. Implement the reviewed tickets in dependency order.",
    "kind": "implement"
  },
  {
    "role": "codex",
    "text": "I defined the fields and implemented search and filtering, then ran combined-filter and empty-result tests. READ-02 is in progress at 75%, awaiting mobile checks. Review the results and remaining verification in Kanban."
  },
  {
    "role": "human",
    "text": "I checked the actual screen. Search is too narrow on my phone. Move the filter below the search field on phones.",
    "kind": "feedback"
  },
  {
    "role": "codex",
    "text": "I reflected the feedback in the plan and ticket acceptance criteria and adjusted the mobile layout. Rechecking it on a phone remains open. READ-02 stays in progress."
  },
  {
    "role": "human",
    "text": "I’ll check the revised screen again. If anything else is needed, let’s discuss it and update the documents."
  }
] as const satisfies readonly DemoMessage[];

export const INTRO_CHAPTERS = [
  {
    "id": "discuss",
    "at": 0,
    "label": "Ideate"
  },
  {
    "id": "draft",
    "at": 5,
    "label": "Draft"
  },
  {
    "id": "read",
    "at": 7,
    "label": "Read"
  },
  {
    "id": "questions",
    "at": 8,
    "label": "Decide"
  },
  {
    "id": "implement",
    "at": 16,
    "label": "Implement"
  },
  {
    "id": "feedback",
    "at": 18,
    "label": "Iterate"
  }
] as const;

export const DEMO_DOCUMENTS = ["plan", "tickets"] as const;
export const demoFileName = (document: DemoDocument) => `01_reading_${document}.md`;
export const MESSAGE_DURATION = 10_000;
export const INTRO_DURATION = (INTRO_MESSAGES.length - 1) * MESSAGE_DURATION;

export function demoStage(index: number) {
  return index < 6 ? "none" : index < 13 ? "draft" : index < 17 ? "reviewed" : index < 19 ? "result" : "feedback";
}

export function demoTicketMarkdown(ticket: DemoTicket, t: TranslateDemo): string {
  const checklist = (items: DemoTicket["checks"]) => items.map(([done, text]) => `- [${done ? "x" : " "}] ${t(text)}`).join("\n");
  return [
    `### ${ticket.id}. ${t(ticket.title)}`, "",
    `Status: ${ticket.status}`, `Progress: ${ticket.progress}%`,
    ...(ticket.status === "DONE" ? ["Completed at: 2026-10-18T10:00:00+09:00"] : []), "",
    "구현 범위:", "", `- ${t(ticket.scope)}`, "",
    "완료 기준:", "", checklist(ticket.acceptance), "",
    "검증:", "", checklist(ticket.checks), "",
    "사용자 지시:", "", `- 2026-10-18: ${t(ticket.decision)}`, "",
    "진행 메모:", "", `- 2026-10-18: ${t(ticket.result)}`,
  ].join("\n");
}

export function demoDocumentMarkdown(index: number, document: DemoDocument, t: TranslateDemo): string {
  const stage = demoStage(index);
  if (stage === "none") return "";
  const questions = stage === "draft";
  if (document === "plan") return [
    `# ${t("Reading journal · Plan")}`, "",
    `## ${t("Scope")}`, ...READING_DEMO.map(ticket => `- ${t(ticket.title)}`), "",
    ...(!questions ? [
      `## ${t("Recorded decisions")}`,
      `- ${t("Filters last for this visit only")}`,
      `- ${t("Note search is excluded this iteration")}`, "",
    ] : []),
    `## ${t("Questions requiring confirmation or a decision (open questions)")}`,
    ...(questions ? [
      `- ${t("Should filters persist across visits?")}`,
      `- ${t("Should this iteration include searching reading notes?")}`,
    ] : [`- ${t("None")}`]),
    ...(stage === "feedback" ? [
      "", `## ${t("After result review")}`,
      `- ${t("Place filters below search on phones")}`,
      `- ${t("Phone verification remains open")}`,
    ] : []),
  ].join("\n");
  if (stage === "feedback") return READING_DEMO.map(ticket => demoTicketMarkdown(ticket, t)).join("\n\n---\n\n");
  return READING_DEMO.map(ticket => {
    const progressed = stage === "result";
    return [
      `### ${ticket.id}. ${t(ticket.title)}`,
      `Status: ${progressed ? ticket.status : "TODO"}`,
      `Progress: ${progressed ? ticket.progress : 0}%`,
      ...(progressed && ticket.status === "DONE" ? ["Completed at: 2026-10-18T10:00:00+09:00"] : []), "",
      "구현 범위:",
      t(ticket.id === "READ-02" ? "Combine title search and read-books filtering." : ticket.scope),
      ...(ticket.id === "READ-02" && !questions ? [t("Decision: filters last for this visit. Exclude note search.")] : []), "",
      ...(progressed ? ticket.id === "READ-02" ? [
        "검증:", `- [x] ${t("Combined-filter and empty-result tests")}`, `- [ ] ${t("Mobile layout check")}`,
      ] : [t(ticket.result)] : [t("Not implemented · Human draft review.")]),
    ].join("\n");
  }).join("\n\n---\n\n");
}

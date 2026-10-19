import { describe, expect, it } from "vitest";
import { english, korean } from "../../i18n/messages";
import { DEMO_DOCUMENTS, INTRO_CHAPTERS, INTRO_DURATION, INTRO_MESSAGES, READING_DEMO, demoDocumentMarkdown, demoStage, demoTicketMarkdown } from "./demo";
import { initialPlayback, playbackLabel, playbackReducer, playbackTime, PLAYBACK_RATES } from "./useIntroPlayback";

describe("intro playback clock", () => {
  it("starts on request, settles elapsed time before rate changes, and pauses exactly", () => {
    expect(playbackLabel(initialPlayback)).toBe("Ready to play");
    let state = playbackReducer(initialPlayback, { type: "toggle", now: 1_000 });
    state = playbackReducer(state, { type: "rate", rate: 3, now: 3_000 });
    expect(state.position).toBe(2_000);
    state = playbackReducer(state, { type: "tick", now: 4_000 });
    expect(state.position).toBe(5_000);
    state = playbackReducer(state, { type: "pause", now: 5_000 });
    expect(state.position).toBe(8_000);
    expect(playbackLabel(state)).toBe("Playback paused");
    expect(playbackReducer(state, { type: "tick", now: 50_000 })).toBe(state);
    state = playbackReducer(state, { type: "toggle", now: 60_000 });
    expect(playbackReducer(state, { type: "tick", now: 61_000 }).position).toBe(11_000);
  });

  it.each(PLAYBACK_RATES)("uses %sx without skipping the final state or looping", rate => {
    let state = playbackReducer({ ...initialPlayback, rate }, { type: "toggle", now: 0 });
    state = playbackReducer(state, { type: "tick", now: 10_000 });
    expect(state.position).toBe(10_000 * rate);
    state = playbackReducer(state, { type: "tick", now: INTRO_DURATION / rate + 1 });
    expect(state.position).toBe(INTRO_DURATION);
    expect(state.playing).toBe(false);
    expect(playbackLabel(state)).toBe("Playback finished");
    expect(playbackTime(state.position)).toBe("3:20");
    expect(playbackReducer(state, { type: "tick", now: 1_000_000 })).toBe(state);
    const replay = playbackReducer(state, { type: "toggle", now: 1_000_001 });
    expect(replay).toMatchObject({ position: 0, playing: true, rate });
  });

  it("seeks without playing, clamps endpoints, and rejects invalid rate or position", () => {
    const state = playbackReducer(initialPlayback, { type: "seek", position: 130_000, now: 0 });
    expect(state).toMatchObject({ position: 130_000, playing: false, started: true });
    expect(playbackReducer(state, { type: "seek", position: -1, now: 0 }).position).toBe(0);
    expect(playbackReducer(state, { type: "seek", position: Infinity, now: 0 }).position).toBe(130_000);
    expect(playbackReducer(state, { type: "seek", position: INTRO_DURATION + 1, now: 0 }).position).toBe(INTRO_DURATION);
    expect(playbackReducer(state, { type: "rate", rate: 0, now: 0 }).rate).toBe(1);
    expect(playbackReducer(state, { type: "rate", rate: NaN, now: 0 }).rate).toBe(1);
  });
});

describe("approved reading-journal story", () => {
  it("translates every dynamic message, chapter, and ticket field in both languages", () => {
    const keys = [
      ...INTRO_MESSAGES.map(message => message.text), ...INTRO_CHAPTERS.map(chapter => chapter.label),
      ...READING_DEMO.flatMap(ticket => [ticket.title, ticket.scope, ticket.note, ticket.decision, ticket.result,
        ...ticket.acceptance.map(([, text]) => text), ...ticket.checks.map(([, text]) => text)]),
    ];
    for (const key of keys) { expect(korean[key], key).toBeTruthy(); expect(english[key], key).toBeTruthy(); }
  });

  it.each(["ko", "en"])("keeps discussion, draft review, decisions, implementation and feedback separate (%s)", language => {
    const t = (key: string) => (language === "ko" ? korean[key] : english[key]) ?? key;
    for (const document of DEMO_DOCUMENTS) expect(demoDocumentMarkdown(5, document, t)).toBe("");
    expect(demoStage(6)).toBe("draft");
    expect(demoDocumentMarkdown(6, "plan", t)).toContain(t("Should filters persist across visits?"));
    expect(demoDocumentMarkdown(12, "tickets", t)).not.toContain("Status: DONE");
    const reviewed = demoDocumentMarkdown(13, "plan", t);
    expect(reviewed).toContain(t("Questions requiring confirmation or a decision (open questions)"));
    expect(reviewed).toContain(`- ${t("None")}`);
    expect(reviewed).not.toContain(t("Should filters persist across visits?"));
    expect(demoDocumentMarkdown(16, "tickets", t)).not.toContain("Status: DONE");
    const implemented = demoDocumentMarkdown(17, "tickets", t);
    expect(implemented).toContain("Progress: 75%");
    expect(implemented).toContain(t("Mobile layout check"));
    expect(demoDocumentMarkdown(19, "plan", t)).toContain(t("Place filters below search on phones"));
    expect(demoDocumentMarkdown(20, "tickets", t)).toBe(READING_DEMO.map(ticket => demoTicketMarkdown(ticket, t)).join("\n\n---\n\n"));
    const ticket = demoTicketMarkdown(READING_DEMO.find(item => item.id === "READ-02")!, t);
    expect(ticket).toContain("Status: IN_PROGRESS\nProgress: 75%");
    expect(ticket).not.toContain("Completed at:");
    expect(ticket).toContain("- [ ]");
  });
});

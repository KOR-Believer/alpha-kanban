import { describe, expect, it } from "vitest";
import { AppActivity } from "./activity";

describe("PWA write and draft barrier", () => {
  it("does not prepare while a draft exists and never discards it", () => {
    const gate = new AppActivity(); const owner = {};
    gate.setDraft(owner, true);
    expect(gate.prepare()).toBe(false);
    expect(gate.busy).toBe(true);
    expect(gate.frozen).toBe(false);
    gate.setDraft(owner, false);
    expect(gate.prepare()).toBe(true);
  });

  it("waits for the entire write and readback, including a rejected save", async () => {
    const gate = new AppActivity();
    let finish!: () => void;
    const writing = gate.run(() => new Promise<void>((resolve) => { finish = resolve; }));
    expect(gate.prepare()).toBe(false);
    finish(); await writing;
    await expect(gate.run(async () => { throw new Error("readback failed"); })).rejects.toThrow("readback failed");
    expect(gate.prepare()).toBe(true);
  });

  it("refuses new mutations after preparation and resumes after an aborted transition", async () => {
    const gate = new AppActivity();
    let touched = false;
    expect(gate.prepare()).toBe(true);
    await expect(gate.run(async () => { touched = true; })).rejects.toThrow("updating");
    expect(touched).toBe(false);
    gate.resume();
    await gate.run(async () => { touched = true; });
    expect(touched).toBe(true);
  });
});

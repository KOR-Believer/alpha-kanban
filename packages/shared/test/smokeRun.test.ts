import { describe, expect, it } from "vitest";
import { createSmokeRun } from "../src/smokeRun.mjs";
import { parseSmokeDocument } from "../src/smokeMarkdown.mjs";
import { smokeSource, smokeSourceId, smokeFirstRun } from "./smokeFixtures";

const options = { title: "부분 회귀", target: "Example v2", environment: "Chrome / test data", caseIds: ["TC-003", "TC-001"],
  documentId: "44444444-4444-4444-8444-444444444444", owner: null, sourcePath: "docs/01_notes_smoke.md", number: 3, createdAt: "2026-11-10T10:00:00Z" };
describe("new smoke run serialization", () => {
  it("freezes current active definitions and the complete common notes in source order, without results or actor inference", () => {
    const source = parseSmokeDocument(smokeSource, "smoke");
    const result = parseSmokeDocument(createSmokeRun(smokeSource, options), "smoke-run", { newRun: true });
    expect(result.valid).toBe(true); expect(result.documentId).not.toBe(smokeSourceId); expect(result.owner).toBeNull();
    expect(result.run).toMatchObject({ sourceId: smokeSourceId, number: 3, state: "OPEN", sourcePath: options.sourcePath });
    expect(result.common?.content).toBe(source.memo?.content);
    expect(result.memo?.content.trim()).toBe("");
    expect(result.cases.map(item => item.id)).toEqual(["TC-001", "TC-003"]);
    for (const item of result.cases) {
      const original = source.cases.find(tc => tc.id === item.id)!;
      expect(item.result).toBe("NOT_RUN"); expect(item.logs).toEqual([]);
      expect(item.revision).toBe(original.revision);
      expect(item.prerequisites?.content).toBe(original.prerequisites?.content);
      expect(item.steps?.content).toBe(original.steps?.content);
      expect(item.expected?.content.trimEnd()).toBe(original.expected?.content.trimEnd());
    }
  });
  it("normalizes new file line endings while preserving source body examples, links and extra fields", () => {
    const source = smokeSource.replace("Revision: 2", "Extra: keep\n\nRevision: 2").replace("#### 기대 결과", "#### 기대 결과\n\n[기준](../reference.md)\n\n```md\nResult: PASS\n```" ).replace(/\n/g,"\r\n");
    const output = createSmokeRun(source, {...options, owner:"@alice"});
    expect(output).not.toContain("\r"); expect(output).toContain("Extra: keep"); expect(output).toContain("[기준](../reference.md)");
    expect(output).toContain("```md\nResult: PASS\n```"); expect(parseSmokeDocument(output,"smoke-run").owner).toBe("@alice");
  });
  it.each([
    {caseIds:[]}, {caseIds:["TC-002"]}, {caseIds:["TC-001","TC-001"]}, {caseIds:["TC-099"]},
    {title:"Bad\n\nResult: PASS"}, {target:"one\nEnvironment: other"}, {documentId:smokeSourceId}, {sourcePath:"../other.md"}, {owner:"@invalid/name"},
  ])("rejects unsafe or ambiguous new-run input %s", change => {
    expect(()=>createSmokeRun(smokeSource,{...options,...change})).toThrow();
  });
  it("rejects a run as the source and missing or unsupported metadata without modifying it", () => {
    expect(()=>createSmokeRun(smokeFirstRun,options)).toThrow();
    expect(()=>createSmokeRun(smokeSource.replace(`Document-ID: ${smokeSourceId}`,""),options)).toThrow();
    expect(()=>createSmokeRun(smokeSource.replace("Document-ID:","Ledger-Format: 999\n\nDocument-ID:"),options)).toThrow();
  });
});

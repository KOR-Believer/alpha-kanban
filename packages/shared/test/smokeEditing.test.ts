import { describe, expect, it } from "vitest";
import { parseSmokeDocument, SMOKE_RESULTS } from "../src/smokeMarkdown.mjs";
import { updateSmokeDocument, type SmokeChange } from "../src/smokeRun.mjs";
import { emptySmokeRun, smokeFirstRun, smokeSource } from "./smokeFixtures";

const at = "2026-11-10T14:12:00+09:00";
const model = (text: string) => parseSmokeDocument(text, "smoke-run");
const edit = (source: string, change: SmokeChange) => updateSmokeDocument(source, "smoke-run", change, at);
describe("scoped smoke edits", () => {
  it.each(SMOKE_RESULTS)("records a user correction to %s without replacing the existing execution or closed state", result => {
    const before=model(smokeFirstRun), tc=before.cases[0]!, previous=tc.logs.at(-1)!;
    const output=edit(smokeFirstRun,{kind:"case",caseId:tc.id!,result,memo:previous.memo!.content,evidence:previous.evidence!.content,reason:"Observed and corrected by the user."});
    const after=model(output), changed=after.cases[0]!;
    expect(after.valid).toBe(true); expect(after.run).toEqual(before.run);
    expect(changed.result).toBe(result);expect(changed.logs).toHaveLength(tc.logs.length+1);
    expect(changed.logs.at(-1)).toMatchObject({kind:"USER_EDIT",actor:null,method:null,from:tc.result,to:result,at});
    expect(output).toContain(smokeFirstRun.slice(tc.records!.range.start,tc.records!.range.end));
    expect(output.slice(after.cases[1]!.range.start)).toBe(smokeFirstRun.slice(before.cases[1]!.range.start));
    expect(changed.prerequisites!.content).toBe(tc.prerequisites!.content);expect(changed.steps!.content).toBe(tc.steps!.content);expect(changed.expected!.content).toBe(tc.expected!.content);
    expect(after.common!.content).toBe(before.common!.content);
  });
  it("distinguishes notes, preserves prior evidence when clearing the current note and never inherits the Owner as actor",()=>{
    const before=model(smokeFirstRun), first=before.cases[0]!;
    const output=edit(smokeFirstRun,{kind:"case",caseId:first.id!,result:first.result!,memo:"",evidence:""});
    const after=model(output), latest=after.cases[0]!.logs.at(-1)!;
    expect(latest).toMatchObject({kind:"NOTE",actor:null,from:first.result,to:first.result,reason:null});
    expect(latest.memo!.content.trim()).toBe(""); expect(output).toContain(first.logs[0]!.memo!.content);
    expect(after.owner).toBe(before.owner);
  });
  it.each([undefined,"Alice","@bob"])("records only an explicitly supplied actor %s",actor=>{
    const output=edit(emptySmokeRun(),{kind:"case",caseId:"TC-001",result:"PASS",memo:"Observed",evidence:"[Capture](../capture.png)",reason:"I checked the result.",actor});
    expect(model(output).cases[0]!.logs.at(-1)!.actor).toBe(actor??null);
  });
  it("closes with remaining IDs without rewriting any result and keeps closure details through subsequent edits",()=>{
    const initial=emptySmokeRun(), before=model(initial), closed=edit(initial,{kind:"close",reason:"Time window ended."}), after=model(closed);
    expect(after.valid).toBe(true);expect(after.run).toMatchObject({state:"CLOSED",closedAt:at,closeReason:"Time window ended. [NOT_RUN: TC-001, TC-003]"});
    expect(after.counts).toEqual(before.counts);expect(closed.slice(after.cases[0]!.range.start)).toBe(initial.slice(before.cases[0]!.range.start));
    const changed=edit(closed,{kind:"case",caseId:"TC-003",result:"BLOCKED",memo:"No permission",evidence:"",reason:"Correct missing record"});
    expect(model(changed).run).toEqual(after.run);
    expect(()=>edit(changed,{kind:"close",reason:"Again"})).toThrow("Only an open run");
  });
  it("edits top notes independently in definitions and runs, without inferring results or rewriting criteria",()=>{
    for(const [source,kind] of [[smokeSource,"smoke"],[smokeFirstRun,"smoke-run"]] as const){
      const before=parseSmokeDocument(source,kind), output=updateSmokeDocument(source,kind,{kind:"memo",memo:"### Observations\n\nAll passed? This is only a note.\n\n```md\n## Test Cases\n```"},at), after=parseSmokeDocument(output,kind);
      expect(after.valid).toBe(true);expect(after.counts).toEqual(before.counts);
      expect(output.slice(after.memo!.range.end)).toBe(source.slice(before.memo!.range.end));
      expect(output.slice(0,after.memo!.range.start)).toBe(source.slice(0,before.memo!.range.start));
    }
  });
  it.each(["", "\n", "\n\n"])("keeps BOM, CRLF and the original EOF newline count %j",end=>{
    const input="\uFEFF"+emptySmokeRun().trimEnd().replace(/\n/g,"\r\n")+end.replace(/\n/g,"\r\n");
    const before=model(input),output=edit(input,{kind:"case",caseId:"TC-003",result:"SKIPPED",memo:"Excluded",evidence:"",reason:"Out of scope"}),after=model(output);
    expect(after.valid).toBe(true);expect(output.startsWith("\uFEFF")).toBe(true);expect(output).not.toMatch(/(?<!\r)\n/);
    expect(output.match(/(?:\r\n)*$/)?.[0]).toBe(end.replace(/\n/g,"\r\n"));
    expect(output.slice(0,after.cases[1]!.range.start)).toBe(input.slice(0,before.cases[1]!.range.start));
  });
  it("rejects unsupported formats, missing reasons and structural injection without returning an altered document",()=>{
    const change:SmokeChange={kind:"case",caseId:"TC-001",result:"PASS",memo:"Observed",evidence:"",reason:""};
    expect(()=>edit(emptySmokeRun(),change)).toThrow("reason");
    expect(()=>edit(emptySmokeRun().replace("# 정렬 변경 회귀","# 정렬 변경 회귀\n\nLedger-Format: 999.0"),{kind:"close",reason:"Stop"})).toThrow();
    expect(()=>edit(emptySmokeRun(),{kind:"memo",memo:"## Test Cases\n\n### TC-999. Inject"})).toThrow();
    expect(()=>edit(emptySmokeRun(),{...change,reason:"Why",memo:"###### 증거\n\nWrong boundary"})).toThrow();
    expect(()=>edit(emptySmokeRun(),{...change,reason:"Why",actor:"@bob\nMethod: BROWSER_USE"})).toThrow();
  });
});

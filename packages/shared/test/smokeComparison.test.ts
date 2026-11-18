import { describe, expect, it } from "vitest";
import { parseSmokeDocument } from "../src/smokeMarkdown.mjs";
import { compareSmokeRuns } from "../src/smokeComparison.mjs";
import { smokeSource, smokeFirstRun, smokeSecondRun } from "./smokeFixtures";
const source=parseSmokeDocument(smokeSource,"smoke"),left=parseSmokeDocument(smokeFirstRun,"smoke-run"),right=parseSmokeDocument(smokeSecondRun,"smoke-run");
const distinct=(text:string)=>parseSmokeDocument(text.replace(left.documentId!,"99999999-9999-4999-8999-999999999999"),"smoke-run");
describe("frozen run comparison",()=>{
  it("matches by case ID while keeping each run's own criteria and results",()=>{
    const result=compareSmokeRuns(left,right,source),row=result.rows[0]!;
    expect(row).toMatchObject({id:"TC-001",revisionChanged:true,criteriaChanged:true,resultChanged:false,different:true});
    expect(row.left?.revision).toBe(1);expect(row.right?.revision).toBe(2);
    expect(row.left?.logs).toHaveLength(1);expect(row.right?.logs).toHaveLength(2);
    expect(row.right?.logs.at(-1)?.kind).toBe("USER_EDIT");
  });
  it("keeps one-sided cases distinct from Not run and labels current retirement separately",()=>{
    const result=compareSmokeRuns(left,right,source),old=result.rows.find(row=>row.id==="TC-002")!,added=result.rows.find(row=>row.id==="TC-003")!;
    expect(old.right).toBeNull();expect(old.currentLifecycle).toBe("RETIRED");expect(old.left?.lifecycle).toBe("ACTIVE");expect(old.left?.result).toBe("PASS");
    expect(added.left).toBeNull();expect(added.right?.result).toBe("NOT_RUN");expect(added.currentLifecycle).toBe("ACTIVE");
    const orphan=compareSmokeRuns(left,right);expect(orphan.currentDefinitionAvailable).toBe(false);expect(orphan.rows.every(row=>row.currentLifecycle===null)).toBe(true);
  });
  it("detects criteria edits even when the revision was not increased and only normalizes line endings",()=>{
    const altered=distinct(smokeFirstRun.replace("Summary:","Summary: "));
    const row=compareSmokeRuns(left,altered).rows[0]!;
    expect(row.revisionChanged).toBe(false);expect(row.criteriaChanged).toBe(true);
    const crlf=distinct(smokeFirstRun.replace(/\n/g,"\r\n"));
    expect(compareSmokeRuns(left,crlf).rows.every(row=>!row.different)).toBe(true);
  });
  it("includes evidence, history and common-condition changes in differences without inventing new results",()=>{
    const evidence=distinct(smokeFirstRun.replace("###### 증거\n", "###### 증거\n\nA new reference.\n"));
    expect(compareSmokeRuns(left,evidence).rows[0]).toMatchObject({notesChanged:true,historyChanged:true,resultChanged:false});
    const common=distinct(smokeFirstRun.replace("## 실행 당시 공통 조건\n","## 실행 당시 공통 조건\n\nUpdated context.\n"));
    const compared=compareSmokeRuns(left,common);expect(compared.commonChanged).toBe(true);expect(compared.rows.every(row=>row.different)).toBe(true);
    expect(compared.rows.every(row=>!row.resultChanged)).toBe(true);
  });
  it("refuses same-file, different-definition and malformed combinations",()=>{
    expect(()=>compareSmokeRuns(left,left)).toThrow();
    expect(()=>compareSmokeRuns(left,{...right,run:{...right.run!,sourceId:"other"}})).toThrow();
    expect(()=>compareSmokeRuns(left,{...right,valid:false})).toThrow();
    expect(compareSmokeRuns(left,right,{...source,documentId:"other"}).currentDefinitionAvailable).toBe(false);
  });
});

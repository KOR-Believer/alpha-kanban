import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BrowserRepository } from "./repository";
import { FakeDirectory, MemoryStorage, testLocks } from "./browserFixtures";
import { parseSmokeDocument } from "@alpha-kanban/shared/smokeMarkdown";
import type { SmokeChange } from "@alpha-kanban/shared/smokeRun";
const original=[...readFileSync(new URL("../../../../docs/31_alpha_kanban_smoke_inventory.md",import.meta.url),"utf8").matchAll(/^```md\n([\s\S]*?)^```$/gm)][1]![1]!;
const change:SmokeChange={kind:"case",caseId:"TC-001",result:"BLOCKED",memo:"Cannot access the page",evidence:"[Reference](../evidence.png)",reason:"Missing permission"};
async function fixture(){
  const storage=new MemoryStorage(),repository=new BrowserRepository(storage,testLocks()),project=new FakeDirectory("example"),folder=project.directory("docs");
  const file=folder.file("01_example_smoke_run.md",original);await repository.connect(project.handle(),"project");
  const workspaceId=(await repository.workspaces()).workspaces[0]!.id,id=(await repository.files(workspaceId))[0]!.id,source=await repository.markdown(workspaceId,id);
  const guard={expectedHash:source.file.hash,expectedMtimeMs:source.file.mtimeMs};
  return {storage,repository,project,folder,file,workspaceId,id,guard,save:()=>repository.editSmoke(workspaceId,id,guard,change)};
}
describe("guarded smoke editing",()=>{
  it("saves result and correction together and returns only the reread file",async()=>{
    const f=await fixture(),saved=await f.save(),model=parseSmokeDocument(saved.markdown,"smoke-run");
    expect(saved.markdown).toBe(f.file.content);expect(model.valid).toBe(true);expect(model.cases[0]?.result).toBe("BLOCKED");
    expect(model.cases[0]?.logs.at(-1)).toMatchObject({kind:"USER_EDIT",actor:null,from:"PASS",to:"BLOCKED"});
    expect(model.run?.state).toBe("CLOSED");expect(await f.repository.recoveries()).toEqual([]);
  });
  it.each(["content","mtime","identity","permission","duplicate","backup"])("preserves the original on a %s conflict before opening a writer",async failure=>{
    const f=await fixture();
    if(failure==="content")f.file.content+="\nExternal note";
    if(failure==="mtime")f.file.mtime++;
    if(failure==="identity")f.folder.file(f.file.name,original);
    if(failure==="permission")f.file.write="denied";
    if(failure==="duplicate")f.folder.file("copy.md",original);
    if(failure==="backup")f.storage.failRecovery=true;
    const current=f.file.content;await expect(f.save()).rejects.toBeInstanceOf(Error);expect(f.file.writes).toBe(0);expect(f.file.opens).toBe(0);expect(f.file.content).toBe(current);
  });
  it.each(["after-open","close","readback"])("retains the before/after recovery copies on %s failure and refuses another attempt",async failure=>{
    const f=await fixture();if(failure==="after-open")f.file.onOpen=()=>{f.file.content+="\nExternal note";};
    if(failure==="close")f.file.failClose=true;if(failure==="readback")f.file.failAfterClose=true;
    await expect(f.save()).rejects.toBeInstanceOf(Error);
    const record=(await f.repository.recoveries())[0]!;expect(record.operation).toBe("smoke-edit");expect(record.before).toBe(original);
    expect(parseSmokeDocument(record.intended,"smoke-run").cases[0]?.result).toBe("BLOCKED");
    await expect(f.save()).rejects.toMatchObject({code:"RECOVERY_REQUIRED"});
    expect(f.file.writes).toBe(failure==="readback"?1:0);
  });
  it("serializes two changes based on the same snapshot instead of overwriting either",async()=>{
    const f=await fixture(),attempts=await Promise.allSettled([f.save(),f.save()]);
    expect(attempts.filter(item=>item.status==="fulfilled")).toHaveLength(1);expect(f.file.writes).toBe(1);
    expect(parseSmokeDocument(f.file.content,"smoke-run").cases[0]?.logs).toHaveLength(parseSmokeDocument(original,"smoke-run").cases[0]!.logs.length+1);
  });
});

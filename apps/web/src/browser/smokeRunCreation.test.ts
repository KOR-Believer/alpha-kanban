import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BrowserRepository } from "./repository";
import { FakeDirectory, MemoryStorage, testLocks } from "./browserFixtures";
import { parseSmokeDocument } from "@alpha-kanban/shared/smokeMarkdown";

const sourceText = [...readFileSync(new URL("../../../../docs/31_alpha_kanban_smoke_inventory.md", import.meta.url),"utf8").matchAll(/^```md\n([\s\S]*?)^```$/gm)][0]![1]!;
const fields = {title:"부분 회귀",target:"Sample v2",environment:"Synthetic Chrome",caseIds:["TC-001"]};
async function fixture(owned = true) {
  const storage = new MemoryStorage(), repository = new BrowserRepository(storage,testLocks());
  const project = new FakeDirectory("example"), docs = project.directory("docs"), owner = owned ? docs.directory("@alice") : docs;
  const folder = owner.directory("feature");
  const source = folder.file("01_notes_smoke.md",sourceText);
  await repository.connect(project.handle(),"project");
  const workspaceId=(await repository.workspaces()).workspaces[0]!.id;
  const file=(await repository.files(workspaceId))[0]!;
  return {storage,repository,project,docs,owner,folder,source,workspaceId,file,
    prepare:()=>repository.prepareSmokeRun(workspaceId,file.id)};
}
describe("guarded smoke run creation",()=>{
  it("uses the physical owner number scope including hidden folders, excludes nested owners and keeps the source untouched",async()=>{
    const f=await fixture(); f.owner.file("22_other_plan.md","# Other"); f.owner.directory(".hidden").file("33_old.md","# Old");
    f.owner.directory("@bob").file("999_foreign.md","# Foreign");
    const plan=await f.prepare(); expect(plan.path).toBe("docs/@alice/feature/34_notes_smoke_run.md");
    expect(plan.owner).toBe("@alice");
    const result=await f.repository.createSmokeRun(plan,fields), run=parseSmokeDocument(result.markdown,"smoke-run",{newRun:true});
    expect(run.valid).toBe(true); expect(run.owner).toBe("@alice"); expect(run.counts?.NOT_RUN).toBe(1);
    expect(run.cases.map(tc=>tc.id)).toEqual(["TC-001"]); expect(run.run?.number).toBe(1);
    expect(f.source.content).toBe(sourceText); expect(f.source.writes).toBe(0); expect(await f.repository.recoveries()).toEqual([]);
    expect((await f.repository.markdown(f.workspaceId,result.file.id)).markdown).toBe(result.markdown);
    f.source.content=f.source.content.replace("Revision: 2","Revision: 3");
    expect((await f.repository.smoke(f.workspaceId,result.file.id)).document.cases[0]?.revision).toBe(2);
  });
  it("supports no settings, keeps the source slug and assigns a distinct ID and next run number",async()=>{
    const f=await fixture(false); f.folder.file("02_notes_plan.md","# Plan");
    const first=await f.repository.createSmokeRun(await f.prepare(),fields);
    const second=await f.repository.createSmokeRun(await f.prepare(),{...fields,caseIds:["TC-003"]});
    expect(second.file.relativePath).toBe("docs/feature/04_notes_smoke_run.md");
    expect(first.file.documentId).not.toBe(second.file.documentId);
    const run=parseSmokeDocument(second.markdown,"smoke-run"); expect(run.owner).toBeNull(); expect(run.run?.number).toBe(2);
  });
  it("serializes duplicate submissions and never creates a second file from the same reviewed setup",async()=>{
    const f=await fixture(), plan=await f.prepare();
    const result=await Promise.allSettled([f.repository.createSmokeRun(plan,fields),f.repository.createSmokeRun(plan,fields)]);
    expect(result.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    expect([...f.folder.children.keys()].filter(name=>name.endsWith("_smoke_run.md"))).toHaveLength(1);
  });
  it.each(["source","mtime","config","number","identity"])("refuses stale %s before any file creation",async change=>{
    const f=await fixture(), plan=await f.prepare();
    if(change==="source")f.source.content+="\nExternal change";
    if(change==="mtime")f.source.mtime++;
    if(change==="config")f.project.file(".ak.config","[documents]\nroot = records\n");
    if(change==="number")f.owner.file("08_other.md","# Other");
    if(change==="identity")f.folder.file(f.source.name,sourceText);
    await expect(f.repository.createSmokeRun(plan,fields)).rejects.toBeInstanceOf(Error);
    expect(f.folder.children.size).toBe(1); expect(f.source.writes).toBe(0);
  });
  it("refuses duplicate document UUIDs in ordinary Markdown and tampered setups",async()=>{
    const f=await fixture(), plan=await f.prepare();
    await expect(f.repository.createSmokeRun({...plan,path:"../bad.md"},fields)).rejects.toMatchObject({code:"INVALID_PREVIEW"});
    f.docs.file("duplicate.md",`# Other\n\nDocument-ID: ${plan.source.file.documentId}\n`);
    await expect(f.repository.createSmokeRun(plan,fields)).rejects.toMatchObject({code:"DUPLICATE_DOCUMENT_ID"});
    expect(f.source.writes).toBe(0);
  });
  it("checks write permission and recovery durability before touching the destination",async()=>{
    const f=await fixture(), plan=await f.prepare(); f.folder.write="denied";
    await expect(f.repository.createSmokeRun(plan,fields)).rejects.toMatchObject({code:"PERMISSION_REQUIRED"});
    expect(f.folder.children.size).toBe(1); f.folder.write="granted"; f.storage.failRecovery=true;
    await expect(f.repository.createSmokeRun(plan,fields)).rejects.toThrow("QuotaExceededError");
    expect(f.folder.children.size).toBe(1);
  });
  it("does not overwrite a collision appearing between the absence check and creation",async()=>{
    const f=await fixture(), plan=await f.prepare(); const original=f.folder.getFileHandle.bind(f.folder);
    f.folder.getFileHandle=async(name,options)=>{if(options?.create) f.folder.file(name,"External content");return original(name,options);};
    await expect(f.repository.createSmokeRun(plan,fields)).rejects.toMatchObject({code:"FILE_EXISTS"});
    const recovery=(await f.repository.recoveries())[0]!;
    expect((await f.repository.reviewRecovery(recovery)).status).toBe("different");
    expect((await f.repository.recoveryDocument(recovery)).markdown).toBe("External content");
  });
  it.each(["source","close","readback"])("retains a recovery record on %s failure and never retries automatically",async stage=>{
    const f=await fixture(), plan=await f.prepare(); const original=f.folder.getFileHandle.bind(f.folder);
    f.folder.getFileHandle=async(name,options)=>{
      const handle=await original(name,options);
      if(options?.create){const file=f.folder.children.get(name)! as typeof f.source;
        if(stage==="source")file.onOpen=()=>{f.source.content+="\nExternal";};
        if(stage==="close")file.failClose=true;
        if(stage==="readback")file.failAfterClose=true;
      } return handle;
    };
    await expect(f.repository.createSmokeRun(plan,fields)).rejects.toBeInstanceOf(Error);
    const recovery=(await f.repository.recoveries())[0]!; expect(recovery.operation).toBe("smoke-create");
    await expect(f.prepare()).rejects.toMatchObject({code:"RECOVERY_REQUIRED"});
    await expect(f.repository.createSmokeRun(plan,fields)).rejects.toMatchObject({code:"RECOVERY_REQUIRED"});
    const created=f.folder.children.get(plan.path.split("/").at(-1)!)! as typeof f.source; created.failAfterClose=false;
    expect((await f.repository.reviewRecovery(recovery)).status).toBe(stage==="readback"?"applied":"unchanged");
    expect(created.writes).toBe(stage==="readback"?1:0); expect(f.source.writes).toBe(0);
  });
  it("can review an absent creation target and rechecks it before dismissing recovery",async()=>{
    const f=await fixture(), plan=await f.prepare(); const original=f.folder.getFileHandle.bind(f.folder);
    f.folder.getFileHandle=async(name,options)=>{if(options?.create)throw new DOMException("Denied","NotAllowedError");return original(name,options);};
    await expect(f.repository.createSmokeRun(plan,fields)).rejects.toThrow("Denied");
    const record=(await f.repository.recoveries())[0]!;
    expect(await f.repository.reviewRecovery(record)).toEqual({hash:null,status:"missing"});
    const name=plan.path.split("/").at(-1)!; f.folder.file(name,"External");
    await expect(f.repository.dismissRecovery(record,null)).rejects.toMatchObject({code:"STALE_FILE"});
    expect(await f.repository.recoveries()).toHaveLength(1);
  });
});

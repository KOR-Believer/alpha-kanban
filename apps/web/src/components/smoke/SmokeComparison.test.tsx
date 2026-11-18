// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SmokeComparison } from "./SmokeComparison";
import { BrowserRepository, browserRepository } from "../../browser/repository";
import { FakeDirectory, MemoryStorage, testLocks } from "../../browser/browserFixtures";
import { setLanguage } from "../../i18n";
vi.mock("@tanstack/react-router",async original=>({...await original<object>(),useNavigate:()=>vi.fn()}));
const texts=[...readFileSync(resolve(process.cwd(),"../../docs/31_alpha_kanban_smoke_inventory.md"),"utf8").matchAll(/^```md\n([\s\S]*?)^```$/gm)].map(match=>match[1]!);
describe("run comparison view",()=>{
  let root:Root,container:HTMLDivElement,folder:FakeDirectory;
  beforeEach(async()=>{
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);await setLanguage("en");
    const service=new BrowserRepository(new MemoryStorage(),testLocks()),project=new FakeDirectory("example");folder=project.directory("docs");
    texts.forEach((text,i)=>folder.file(`${i+1}_notes_${i?"smoke_run":"smoke"}.md`,text));
    await service.connect(project.handle(),"project");const workspaceId=(await service.workspaces()).workspaces[0]!.id,files=await service.files(workspaceId);
    for(const method of ["smokeCollection","linkContext"] as const)vi.spyOn(browserRepository,method).mockImplementation(service[method].bind(service) as never);
    container=document.createElement("div");document.body.append(container);root=createRoot(container);
    await act(async()=>root.render(<SmokeComparison workspaceId={workspaceId} fileId={files.find(file=>file.type==="smoke")!.id}/>));
  });
  afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
  const button=(label:string)=>[...document.querySelectorAll<HTMLButtonElement>("button")].find(button=>button.textContent===label)!;
  async function open(){await act(async()=>button("Compare runs").click());for(let i=0;i<80&&!document.querySelector("table");i++)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,5));});}
  it("renders independent run cells and current retirement with missing-case labels",async()=>{
    await open();expect(document.querySelectorAll('tbody > tr')).toHaveLength(3);
    expect(document.body.textContent).toContain("Revision differs");expect(document.body.textContent).toContain("Currently retired");
    expect(document.body.textContent?.match(/Not included in this run/g)).toHaveLength(2);
    await act(async()=>button("TC-001").click());expect(document.body.textContent).toContain("Browser Use");expect(document.body.textContent).toContain("@bob correction");
    expect(document.querySelectorAll('.ak-code-diff')).toHaveLength(2);
    await act(async()=>button("Back to sheet").click());expect(document.querySelector('[role="dialog"]')).toBeNull();
    for(const file of folder.children.values())expect((file as {writes?:number}).writes).toBe(0);
  });
  it("keeps comparison selection and history readable across language changes",async()=>{
    await open();await act(async()=>button("TC-002").click());await act(async()=>setLanguage("ko"));
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("현재 폐기됨");
    expect(document.querySelector('[aria-label="TC-002 상세 비교"]')?.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelectorAll('[role="combobox"]')).toHaveLength(2);
    expect([...folder.children.values()].every(file=>(file as {writes?:number}).writes===0)).toBe(true);
  });
});

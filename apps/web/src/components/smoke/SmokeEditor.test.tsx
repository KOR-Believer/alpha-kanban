// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SmokeEditor } from "./SmokeEditor";
import { BrowserRepository, browserRepository } from "../../browser/repository";
import { FakeDirectory, type FakeFile, MemoryStorage, testLocks } from "../../browser/browserFixtures";
import { setLanguage } from "../../i18n";
import { appActivity } from "../../pwa/activity";
import { parseSmokeDocument } from "@alpha-kanban/shared/smokeMarkdown";
const text=[...readFileSync(resolve(process.cwd(),"../../docs/31_alpha_kanban_smoke_inventory.md"),"utf8").matchAll(/^```md\n([\s\S]*?)^```$/gm)][1]![1]!;
describe("smoke result editor",()=>{
  let root:Root,container:HTMLDivElement,file:FakeFile,client:QueryClient,history:ReturnType<typeof createMemoryHistory>;
  beforeEach(async()=>{
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);await setLanguage("en");
    const service=new BrowserRepository(new MemoryStorage(),testLocks()),project=new FakeDirectory("example");file=project.directory("docs").file("01_notes_smoke_run.md",text);
    await service.connect(project.handle(),"project");const workspaceId=(await service.workspaces()).workspaces[0]!.id,id=(await service.files(workspaceId))[0]!.id,source=await service.markdown(workspaceId,id);
    for(const method of ["editSmoke","recoveries"] as const)vi.spyOn(browserRepository,method).mockImplementation(service[method].bind(service) as never);
    container=document.createElement("div");document.body.append(container);root=createRoot(container);client=new QueryClient({defaultOptions:{queries:{retry:false}}});
    history=createMemoryHistory({initialEntries:["/smoke"]});
    const route=createRootRoute({component:()=> <QueryClientProvider client={client}><SmokeEditor file={source.file} document={source}>{a=><><button onClick={()=>a.editCase("TC-001")}>Edit TC</button><button onClick={a.editMemo}>Edit memo</button></>}</SmokeEditor></QueryClientProvider>});
    const router=createRouter({history,routeTree:route.addChildren([createRoute({getParentRoute:()=>route,path:"/smoke"}),createRoute({getParentRoute:()=>route,path:"/other"})])});
    await act(async()=>{await router.load();root.render(<RouterProvider router={router}/>);});
  });
  afterEach(async()=>{await act(async()=>root.unmount());client.clear();container.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
  const button=(label:string)=>[...document.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent===label)!;
  const click=async(label:string)=>act(async()=>button(label).click());
  async function fill(element:HTMLInputElement|HTMLTextAreaElement,value:string){await act(async()=>{Object.getOwnPropertyDescriptor(element instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,"value")!.set!.call(element,value);element.dispatchEvent(new Event("input",{bubbles:true}));});}
  async function settled(){for(let i=0;i<80&&document.querySelector('button:disabled');i++)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,5));});}
  it("starts without an inferred actor and appends a user correction while preserving old observations",async()=>{
    await click("Edit TC");expect(document.querySelector<HTMLInputElement>('input')!.value).toBe("");expect(appActivity.prepare()).toBe(false);
    const old=parseSmokeDocument(file.content,"smoke-run").cases[0]!.logs[0]!.memo!.content;
    const areas=document.querySelectorAll<HTMLTextAreaElement>("textarea");await fill(areas[0]!,"User observation");await fill(areas[2]!,"Correct a mistaken note");
    await fill(document.querySelector<HTMLInputElement>("input")!,"@bob");await click("Save");await settled();
    const model=parseSmokeDocument(file.content,"smoke-run");expect(model.cases[0]!.logs.at(-1)).toMatchObject({kind:"USER_EDIT",actor:"@bob",from:"PASS",to:"PASS"});
    expect(file.content).toContain(old);expect(model.run?.state).toBe("CLOSED");expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it("preserves pending notes through a route attempt and language switch until discard is explicit",async()=>{
    await click("Edit memo");await fill(document.querySelector<HTMLTextAreaElement>("textarea")!,"Unsubmitted note");
    await act(async()=>history.push("/other"));expect(history.location.pathname).toBe("/smoke");await click("Keep editing");
    await act(async()=>setLanguage("ko"));expect(document.querySelector<HTMLTextAreaElement>("textarea")!.value).toBe("Unsubmitted note");
    await act(async()=>history.push("/other"));await click("버리고 이동");expect(history.location.pathname).toBe("/other");expect(file.writes).toBe(0);expect(appActivity.unloadRisk).toBe(false);
  });
  it("keeps edits after an external change and does not retry with a new hash",async()=>{
    await click("Edit memo");await fill(document.querySelector<HTMLTextAreaElement>("textarea")!,"Local draft");file.content+="\nExternal note";
    await click("Save");for(let i=0;i<80&&!document.querySelector('[role="alert"]');i++)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,5));});
    expect(document.querySelector<HTMLTextAreaElement>("textarea")!.value).toBe("Local draft");expect(button("Save").disabled).toBe(true);
    expect(file.content).toBe(text+"\nExternal note");expect(file.writes).toBe(0);expect(browserRepository.editSmoke).toHaveBeenCalledTimes(1);
  });
  it("keeps a draft through its manual tour and confines keyboard focus without saving",async()=>{
    vi.spyOn(HTMLElement.prototype,"getClientRects").mockImplementation(function(this:HTMLElement){return(this.hidden?[]:[new DOMRect(0,0,400,50)])as unknown as DOMRectList;});
    vi.spyOn(HTMLElement.prototype,"scrollIntoView").mockImplementation(()=>undefined);
    await click("Edit memo");await fill(document.querySelector<HTMLTextAreaElement>("textarea")!,"Keep this unsaved note");
    await click("Tour this dialog");
    expect(document.querySelector('.driver-popover-title')?.textContent).toBe("Review the kind of change");
    for(let i=0;i<6;i++){
      await act(async()=>window.dispatchEvent(new KeyboardEvent("keydown",{key:"Tab",bubbles:true,cancelable:true})));
      expect(document.activeElement?.closest('.driver-popover')).not.toBeNull();
    }
    await act(async()=>window.dispatchEvent(new KeyboardEvent("keyup",{key:"Escape",code:"Escape"})));
    expect(document.querySelector('.driver-popover')).toBeNull();
    expect(document.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe("Keep this unsaved note");
    expect(browserRepository.editSmoke).not.toHaveBeenCalled();expect(file.writes).toBe(0);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });
});

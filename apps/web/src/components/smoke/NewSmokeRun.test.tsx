// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NewSmokeRun } from "./NewSmokeRun";
import { BrowserRepository, browserRepository } from "../../browser/repository";
import { FakeDirectory, MemoryStorage, testLocks } from "../../browser/browserFixtures";
import { setLanguage } from "../../i18n";
import { appActivity } from "../../pwa/activity";

const text=[...readFileSync(resolve(process.cwd(),"../../docs/31_alpha_kanban_smoke_inventory.md"),"utf8").matchAll(/^```md\n([\s\S]*?)^```$/gm)][0]![1]!;
describe("new run dialog",()=>{
  let root:Root, container:HTMLDivElement, service:BrowserRepository, folder:FakeDirectory, workspaceId:string, sourceFileId:string;
  let history:ReturnType<typeof createMemoryHistory>, client:QueryClient;
  const created=vi.fn();
  beforeEach(async()=>{
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true); await setLanguage("en"); created.mockReset();
    service=new BrowserRepository(new MemoryStorage(),testLocks());
    const project=new FakeDirectory("example"); folder=project.directory("docs"); folder.file("01_notes_smoke.md",text);
    await service.connect(project.handle(),"project"); workspaceId=(await service.workspaces()).workspaces[0]!.id; sourceFileId=(await service.files(workspaceId))[0]!.id;
    for(const method of ["prepareSmokeRun","createSmokeRun","recoveries"] as const) vi.spyOn(browserRepository,method).mockImplementation(service[method].bind(service) as never);
    container=document.createElement("div"); document.body.append(container); root=createRoot(container);
    client=new QueryClient({defaultOptions:{queries:{retry:false}}});
    history=createMemoryHistory({initialEntries:["/previous","/smoke"]});
    const route=createRootRoute({component:()=> <QueryClientProvider client={client}><NewSmokeRun workspaceId={workspaceId} sourceFileId={sourceFileId} onCreated={created}/></QueryClientProvider>});
    const router=createRouter({history,routeTree:route.addChildren([createRoute({getParentRoute:()=>route,path:"/smoke"}),createRoute({getParentRoute:()=>route,path:"/previous"})])});
    await act(async()=>{await router.load();root.render(<RouterProvider router={router}/>);});
  });
  afterEach(async()=>{await act(async()=>root.unmount()); client.clear(); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();});
  const button=(label:string)=>[...document.querySelectorAll<HTMLButtonElement>("button")].find(button=>button.textContent===label)!;
  async function click(label:string){await act(async()=>button(label).click());}
  async function ready(check:()=>boolean){for(let i=0;i<80&&!check();i++)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,5));});expect(check()).toBe(true);}
  async function open(){await click("New run");await ready(()=>Boolean(document.querySelector("input")));}
  async function fill(){await act(async()=>{document.querySelectorAll<HTMLInputElement>('input:not([type="checkbox"])').forEach((input,i)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,["Regression","Example build","Chrome test"][i]);input.dispatchEvent(new Event("input",{bubbles:true}));});});}
  it("prepares without writes, selects only active cases and creates once from an explicit action",async()=>{
    await open(); expect(folder.children.size).toBe(1); expect(appActivity.prepare()).toBe(false);
    expect(document.querySelectorAll('[role="checkbox"]')).toHaveLength(2); expect(document.body.textContent).not.toContain("TC-002");
    await fill(); await act(async()=>document.querySelectorAll<HTMLButtonElement>('[role="checkbox"]')[1]!.click());
    await click("Create run"); await ready(()=>created.mock.calls.length===1); expect(folder.children.size).toBe(2);
    expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(appActivity.unloadRisk).toBe(false);
    const run=await service.smoke(workspaceId,created.mock.calls[0]![0].id); expect(run.document.cases.map(item=>item.id)).toEqual(["TC-001"]);
  });
  it("preserves setup through locale changes and cancellation until discard is explicit",async()=>{
    await open(); await fill(); await act(async()=>setLanguage("ko"));
    expect(document.querySelector<HTMLInputElement>("input")?.value).toBe("Regression");
    await click("취소"); expect(document.body.textContent).toContain("작성 중인 회차 설정을 버릴까요?");
    await click("계속 작성"); expect(document.querySelector<HTMLInputElement>("input")?.value).toBe("Regression");
    await click("취소"); await click("버리고 이동");
    expect(folder.children.size).toBe(1); expect(created).not.toHaveBeenCalled(); expect(appActivity.unloadRisk).toBe(false);
  });
  it("guards history navigation while a setup is dirty",async()=>{
    await open(); await fill(); await act(async()=>history.push("/previous"));
    expect(document.body.textContent).toContain("Discard this run setup?"); expect(history.location.pathname).toBe("/smoke");
    await click("Keep editing"); expect(history.location.pathname).toBe("/smoke");
    await act(async()=>history.push("/previous")); await click("Discard and continue");
    expect(history.location.pathname).toBe("/previous"); expect(folder.children.size).toBe(1);
  });
  it("keeps input and blocks another submit after an uncertain write",async()=>{
    await open(); await fill();
    vi.spyOn(browserRepository,"createSmokeRun").mockRejectedValue(new Error("The saved content could not be verified. Review the recovery record."));
    await click("Create run"); expect(button("Create run").disabled).toBe(true);
    expect(document.querySelector<HTMLInputElement>("input")?.value).toBe("Regression"); expect(created).not.toHaveBeenCalled();
    await click("Create run"); expect(browserRepository.createSmokeRun).toHaveBeenCalledTimes(1);
  });
});

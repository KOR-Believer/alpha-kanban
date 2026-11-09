// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setLanguage } from "../../i18n";
import { documentFixture, projectFixture } from "../../allProjectsFixtures";
import { DocumentSetSwitcher, DocumentStatusSearch } from "./DocumentStatusControls";

let root: Root, container: HTMLDivElement;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await setLanguage("en");
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function render(element: React.ReactNode) { await act(async () => root.render(element)); }
async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

it("opens search on demand, retains a nonempty query, and collapses an empty field after leaving it", async () => {
  const reveal = vi.fn();
  function SearchFixture() {
    const [value, setValue] = useState("");
    return <><DocumentStatusSearch value={value} onChange={setValue} onReveal={reveal} /><button data-outside>Outside</button></>;
  }
  await render(<SearchFixture />);
  const trigger = container.querySelector<HTMLButtonElement>('[aria-label="Search documents and tickets"]')!;
  const outside = container.querySelector<HTMLButtonElement>("[data-outside]")!;
  expect(container.querySelector("input")).toBeNull();
  await act(async () => trigger.click());
  const input = container.querySelector("input")!;
  expect(document.activeElement).toBe(input); expect(reveal).toHaveBeenCalled();
  await type(input, "blue lighthouse");
  await act(async () => outside.focus());
  expect(container.querySelector("input")?.value).toBe("blue lighthouse");
  await act(async () => { input.focus(); input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });
  expect(document.activeElement).toBe(trigger);
  expect(input.value).toBe("blue lighthouse");
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Clear search"]')!.click());
  expect(document.activeElement).toBe(input); expect(input.value).toBe("");
  await act(async () => outside.focus());
  expect(container.querySelector("input")).toBeNull();
  await act(async () => trigger.click());
  await act(async () => container.querySelector("input")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
  expect(container.querySelector("input")).toBeNull(); expect(document.activeElement).toBe(trigger);
});

it("shows a restored or panel-entered query without stealing focus or opening the panel", async () => {
  const reveal = vi.fn(), change = vi.fn();
  const search = (value: string) => <><DocumentStatusSearch value={value} onChange={change} onReveal={reveal} /><button data-outside>Outside</button></>;
  await render(search(""));
  await act(async () => container.querySelector<HTMLButtonElement>("[data-outside]")!.focus());
  const focused = document.activeElement;
  await render(search("restored query"));
  expect(container.querySelector("input")?.value).toBe("restored query");
  expect(document.activeElement).toBe(focused); expect(reveal).not.toHaveBeenCalled();
  await render(search("")); expect(container.querySelector("input")).toBeNull();
});

it("does not offer a switcher for a single document", async () => {
  const file = documentFixture(projectFixture("root/project", "project")).file;
  await render(<DocumentSetSwitcher file={file} documents={[file]} href={() => "/"} onSelect={vi.fn()} />);
  expect(container.textContent).toBe("Tickets"); expect(container.querySelector("button, a")).toBeNull();
});

// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { VirtualTicketList } from "./VirtualTicketList";
import { TicketBoard } from "../../App";
import { documentFixture, projectFixture } from "../../allProjectsFixtures";

let host: HTMLDivElement, root: Root;
const items = Array.from({ length: 1000 }, (_, index) => `ticket-${index}`);
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1200);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(190);
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(190000);
  vi.spyOn(HTMLElement.prototype, "scrollTo").mockImplementation(function(this: HTMLElement, options: number | ScrollToOptions) {
    if (typeof options === "object") this.scrollTop = options.top ?? this.scrollTop;
    this.dispatchEvent(new Event("scroll"));
  });
  host = document.createElement("div"); host.setAttribute("data-board-scroll", ""); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("bounds card DOM, changes the visible window and keeps a dragged card mounted", async () => {
  await act(async () => root.render(<VirtualTicketList items={items} itemKey={(key) => key} pinnedKey="ticket-0">{(key) => <button>{key}</button>}</VirtualTicketList>));
  expect(host.querySelectorAll("button").length).toBeGreaterThan(0);
  expect(host.querySelectorAll("button").length).toBeLessThan(30);
  expect(host.querySelector('[data-virtual-key="ticket-900"]')).toBeNull();
  await act(async () => { host.scrollTop = 178200; host.dispatchEvent(new Event("scroll")); });
  expect(host.querySelector('[data-virtual-key="ticket-900"]')).not.toBeNull();
  expect(host.querySelector('[data-virtual-key="ticket-0"]')).not.toBeNull();
  expect(host.querySelectorAll("button").length).toBeLessThan(30);
});

it("reaches offscreen cards with End and Home while retaining keyboard focus", async () => {
  await act(async () => root.render(<VirtualTicketList items={items} itemKey={(key) => key}>{(key) => <button>{key}</button>}</VirtualTicketList>));
  await act(async () => { const first = host.querySelector("button")!; first.focus(); first.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true })); });
  expect(document.activeElement?.textContent).toBe("ticket-999");
  await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true })));
  expect(document.activeElement?.textContent).toBe("ticket-0");
});

it("searches the whole project document before windowing and opens the result by its real ID", async () => {
  const response = documentFixture(projectFixture("/work/example", "w_test"));
  response.document.tickets = items.map((id, index) => ({ ...response.document.tickets[0]!, id,
    searchText: `### ${id}. Heading\n${index === 999 ? "마지막 본문 일치" : "Ordinary text"}` }));
  const select = vi.fn();
  const render = (searchQuery: string) => root.render(<TicketBoard document={response} ticketsByStatus={new Map([["DONE", response.document.tickets]])}
    onSaveStatus={async () => {}} onTicketSelect={select} searchQuery={searchQuery} />);
  await act(async () => render(""));
  expect(host.querySelectorAll('[data-tour="board-card"]').length).toBeLessThan(30);
  await act(async () => render("마지막 본문"));
  expect(host.querySelectorAll('[data-tour="board-card"]')).toHaveLength(1);
  await act(async () => host.querySelector<HTMLButtonElement>('[data-tour="board-card"] a')!.click());
  expect(select).toHaveBeenCalledWith("ticket-999");
  expect(response.document.tickets).toHaveLength(1000);
});

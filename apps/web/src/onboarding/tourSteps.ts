import type { DriveStep } from "driver.js";
import type { TFunction } from "i18next";

export type TourKind = "start" | "project" | "all" | "detail";

export function tourSteps(kind: TourKind, t: TFunction): DriveStep[] {
  const step = (anchor: string, title: string, description: string): DriveStep => ({
    element: `[data-tour="${anchor}"]`, popover: { title: t(title), description: t(description) },
  });
  const folders = () => step("local-folders", "Manage folder access", "Allow editing when you want to save changes. Reconnect folders when access expires, or inspect recovery records if a save could not be verified.");
  const status = () => step("board-status", "Read progress by status", "Each column groups tickets by their current status. Moving a card to another column asks for confirmation and records your reason in Markdown. You can also just read the board.");
  const card = () => step("board-card", "Open a ticket for the details", "Read the ticket ID, priority, and progress here. Select the card to review its scope, completion criteria, and history. The detail window has its own tour.");
  if (kind === "start") return [
    step("open-project", "Open one project", "Choose the project folder you are working in. You do not need to register its parent folder first."),
    step("register-workspace", "Connect several projects", "Register the parent folder that contains your projects. Its immediate subfolders will appear as projects."),
    step("new-project", "Start a new project folder", "Create a named project folder inside a registered workspace. Register a workspace first if this button is unavailable."),
    step("project-list-tools", "Find and reopen projects", "Recent projects are the ones you opened. Other projects come from connected folders. Search by name or path and choose a sort order within each list."),
    step("auto-open", "Choose where the app starts", "Enable this to reopen your last project next time. Changing this setting does not leave the current screen."),
    step("registered-workspaces", "Review connected workspaces", "See the parent folders you registered here. Manage lets you reconnect folders, allow editing, or disconnect them without deleting files."),
    step("skill-install", "Prepare your AI tool", "Review and copy the installation request into Codex. The implementation-ledger skill helps your AI write plans and tickets for this board."),
    step("ai-workflow", "From discussion to implementation", "Discuss your idea with AI, review the plan, resolve questions affecting this work, and update the tickets before requesting implementation. Usage guide walks through an example."),
  ];
  if (kind === "detail") return [
    step("ticket-view", "Choose a comfortable detail view", "Use side, center, or full view. Drag the edges of a peek to resize it. Changing the view keeps your unfinished inputs."),
    step("ticket-scope", "Read the work before changing it", "Review the goal, scope, exclusions, and dependencies. These describe what the ticket is asking your AI to implement."),
    step("ticket-criteria", "Check the completion evidence", "Compare the completion criteria and verification checklist with the results. A status label alone does not explain what was verified."),
    step("ticket-status", "Change status with a reason", "Status and progress are saved together with your reason. An empty reason uses the displayed default. Nothing is written until you choose Save status."),
    step("ticket-instructions", "Leave an optional instruction", "Add feedback or a bug report here. It is appended to user instructions in the same Markdown. Ask your AI to reread the file; saving here does not start AI work."),
    step("ticket-notes", "Follow the recorded results", "Progress notes contain the work and verification recorded by your AI. Earlier notes and checklists stay available when a completed ticket is reopened."),
  ];
  if (kind === "all") return [
    step("project-filters", "Choose which projects to see", "Use these filters to view tickets from one or more projects together."),
    step("ticket-search", "Find a ticket across projects", "Search by ticket ID or title. Search and project filters work together and only change what this board shows."),
    step("hide-done", "Focus on unfinished work", "Hide completed tickets without changing their status or removing them from the documents. Turn this off to see them again."),
    status(), card(),
    step("ticket-project", "Continue in the project board", "Select the project name to open its board with this ticket still open. You can return to All tickets from the project header."),
    step("ticket-order", "Arrange this board without editing files", "The arrow buttons and moves within the same column change this board's display order only. Moving to another status is different: it requires confirmation and updates Markdown."),
    folders(),
  ];
  return [
    step("project-switcher", "Switch the current project", "Choose another connected project here. The Alpha Kanban name returns to the start screen."),
    step("documents", "Find the document you need", "Search document names and paths, then select a plan, ticket, or inventory from the sidebar. Related documents are grouped together."),
    step("document-filters", "Keep the document list focused", "Hide plain Markdown or document sets whose tickets are all complete. These filters only affect the sidebar and do not delete or edit documents."),
    step("document-sort", "Choose a document order", "Sort by document number, recent changes, or progress. The arrow reverses the order. This is a viewing preference, not a file edit."),
    step("document-view", "Switch between board and Markdown", "The board summarizes tickets. Markdown shows the whole document, including text that does not appear on cards. Both views read the same file."),
    step("project-guide", "Create your first plan and tickets", "Use these example requests in your AI tool. Review the draft, discuss relevant open questions, update the tickets, and then request implementation. Ordinary Markdown remains available in the sidebar."),
    status(), card(),
    step("all-tickets", "See work across projects", "Open All tickets to compare connected projects on one board and filter the projects you want to see."),
    folders(),
  ];
}

export function availableTourSteps(kind: TourKind, t: TFunction, root: ParentNode = document): DriveStep[] {
  return tourSteps(kind, t).flatMap((step) => {
    const element = Array.from(root.querySelectorAll<HTMLElement>(step.element as string))
      .find((candidate) => candidate.getClientRects().length > 0 && getComputedStyle(candidate).visibility !== "hidden");
    return element ? [{ ...step, element }] : [];
  });
}

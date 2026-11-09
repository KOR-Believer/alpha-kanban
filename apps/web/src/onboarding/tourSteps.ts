import type { DriveStep } from "driver.js";
import type { TFunction } from "i18next";

export type TourKind = "start" | "project" | "all" | "detail" | "linked" | "maintenance" | "link" | "connections" | "skill" | "docs" | "releases";

export function tourSteps(kind: TourKind, t: TFunction): DriveStep[] {
  const step = (anchor: string, title: string, description: string): DriveStep => ({
    element: `[data-tour="${anchor}"]`, popover: { title: t(title), description: t(description) },
  });
  const folders = () => step("local-folders", "Manage folders and local links", "Manage folder access and connections from another computer’s paths to your local folders. Change or remove a link connection without editing the original Markdown. If folder access expires, allow it again here.");
  const skills = () => step("skill-updates", "Keep your installed skill up to date", "Drop or choose your installed implementation-ledger folder to compare it with the skill provided by this app. Review and approve an update to back up the existing files before replacing them. Connecting alone does not change files.");
  const status = () => step("board-status", "Read progress by status", "Each column groups tickets by their current status. Moving a card to another column asks for confirmation and records your reason in Markdown. You can also just read the board.");
  const card = () => step("board-card", "Open a ticket for the details", "Read the ticket ID, priority, and progress here. Select the card to review its scope, completion criteria, and history. The detail window has its own tour.");
  if (kind === "maintenance") return [
    step("maintenance-purpose", "Maintain this document", "Review format updates for the selected document, such as a missing ID, folder-based Owner correction, or obsolete guidance removal. Nothing is saved by opening this preview."),
    step("maintenance-diff", "Compare before and after", "Removed lines are marked with minus signs and added lines with plus signs. Expand unchanged context when you need to read around a change."),
    step("maintenance-result", "Check what stays", "Review any preserved sections or issues here. Referenced sections can stay while other cleanup proceeds; ticket content remains intact."),
    step("maintenance-apply", "Save only after review", "Apply reviewed changes saves this document. If the file changed elsewhere, refresh the preview before applying. Cancel leaves the file as it was.")
  ];
  if (kind === "link") return [
    step("link-original", "Check the original path", "Expand this to check the path written in the Markdown. Connect it to a folder on this computer without changing the original link."),
    step("link-folders", "Choose the matching local folder", "Choose a discovered repository or select a folder directly. Check its Git identity and location; a similar folder name alone is not enough."),
    step("link-selection", "Set the reusable path", "Match the old folder prefix to your local folder. The remaining path must lead to the intended file. Connecting a repository root can cover other links under the same old root."),
    step("link-preview", "Review the complete connection", "Check the old prefix, selected folder, remaining path and target file together before saving."),
    step("link-apply", "Confirm the connection yourself", "Review selected folder prepares a preview. The final connection button saves it in this browser for this source project. Local folders lets you change or remove it later.")
  ];
  if (kind === "connections") return [
    step("folder-connections", "Manage access to your folders", "Reconnect a folder here when access expires. Disconnecting removes its browser connection without deleting files."),
    step("link-connections", "Reuse and adjust local links", "Each connection maps an old path to a local folder for its source project. Change the target or remove a mapping here without editing Markdown."),
    step("folder-recovery", "Review an interrupted save", "If a document save could not be verified, inspect its recovery record before continuing. Restoration is a separate action you confirm.")
  ];
  if (kind === "skill") return [
    step("skill-folder", "Connect your installed skill", "Drop the implementation-ledger folder here or choose it with the folder picker. Review the selected folder and allow access. Connecting does not install or replace files."),
    step("skill-location", "Find the right folder", "If you do not know the installation path, copy the request in this guide and ask the AI tool that uses the skill. Choose the dedicated implementation-ledger folder."),
    step("skill-comparison", "Compare with this app’s skill", "The comparison uses the files in your connected folder and the skill provided by this app. Open changed files to review their contents, even when the displayed versions match."),
    step("skill-apply", "Approve each update", "Finish AI work using the skill and review the changes before confirming. Back up and update skill saves a full backup before replacing files."),
    step("skill-reinstall", "Review a deliberate replacement", "Reinstall has its own review and confirmation for custom or unrecognized files. The app backs them up before replacing them with its provided skill."),
    step("skill-backups", "Keep or restore a backup", "Backups stay in this browser on this site, including after disconnecting. Export a copy before clearing browser data. Restore asks for confirmation and stops if files have changed outside the app."),
    step("skill-restore", "Confirm restoration separately", "Confirm restore replaces only files matching the recorded copies. Finish work using this skill first; this tour does not restore anything.")
  ];
  if (kind === "linked") return [
    step("linked-source", "Return to your source document", "This link returns to the document you were reading. Connected pages keep that project’s document panel and your unfinished ticket inputs."),
    step("linked-readonly", "Read a connected document", "This page opens a local file through your saved connection. It is read-only here; follow its links and outline just as in an ordinary document."),
    step("document-properties", "Read the recorded properties", "Owner is the name recorded in this file. Folder ownership is determined separately by the nearest @ folder. Document-ID identifies the file even after a move."),
    step("document-outline", "Jump to a heading", "Use the outline to move within this document. Heading links let you return to a specific section.")
  ];
  if (kind === "docs") return [
    step("docs-navigation", "Choose a guide by task", "Browse topics here, from the first plan to document ownership, local links and skill updates. On a narrow screen, use Browse documentation."),
    step("docs-search", "Search the guides", "Search guide titles and contents by feature, setting or question. Selecting a result opens the matching section."),
    step("docs-toc", "Find a section on this page", "Use this outline to jump to a section. On a narrow screen, expand On this page above the article."),
    step("docs-example", "Try an example after reading", "These examples illustrate the choices described above. Trying an example does not change your local documents or folder connections."),
    step("docs-next", "Continue with a related guide", "Use the previous and next links to continue through the guides. You can return to the app from the header.")
  ];
  if (kind === "releases") return [
    step("release-list", "Browse what changed", "Choose a release to read its changes and related usage guides. Reading a release does not apply an app or skill update."),
    step("release-back", "Return to release history", "Return to the dated release list here."),
    step("release-changes", "Read this release’s changes", "Review the changes and examples for this release. Use the related guides for current instructions."),
    step("release-guides", "Go from changes to usage", "Open the guide for a feature you want to use. App updates and skill updates still use their own review and confirmation.")
  ];
  if (kind === "start") return [
    step("open-project", "Open one project", "Choose the project folder you are working in. You do not need to register its parent folder first."),
    step("register-workspace", "Connect several projects", "Register the parent folder that contains your projects. Its immediate subfolders will appear as projects."),
    step("new-project", "Start a new project folder", "Create a named project folder inside a registered workspace. Register a workspace first if this button is unavailable."),
    step("project-list-tools", "Find and reopen projects", "Recent projects are the ones you opened. Other projects come from connected folders. Search by name or path and choose a sort order within each list."),
    step("auto-open", "Choose where the app starts", "Enable this to reopen your last project next time. Changing this setting does not leave the current screen."),
    step("registered-workspaces", "Review connected workspaces", "See the parent folders you registered here. Manage lets you reconnect folders, allow editing, or disconnect them without deleting files."),
    step("skill-install", "Prepare your AI tool", "Review and copy the installation request into your AI tool. The implementation-ledger skill helps your AI write plans and tickets for this board."),
    skills(),
    step("ai-workflow", "From discussion to implementation", "Discuss your idea with AI, review the plan, resolve questions affecting this work, and update the tickets before requesting implementation. Open Help to see an example of creating plans and tickets with AI."),
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
    step("ticket-search", "Find a ticket across projects", "Search by ticket ID, title or body, including tickets outside the screen. Search and project filters work together."),
    step("board-owners", "Combine your owner names", "Select one or more names, such as @alice and @alex, to see either name across projects. Unassigned can be included too. Clear the selection to show everyone; project sidebar filters stay separate."),
    step("hide-done", "Focus on unfinished work", "Hide completed tickets without changing their status or removing them from the documents. Turn this off to see them again."),
    status(), card(),
    step("ticket-project", "Continue in the project board", "Select the project name to open its board with this ticket still open. You can return to All tickets from the project header."),
    step("ticket-order", "Arrange this board without editing files", "The arrow buttons and moves within the same column change this board's display order only. Moving to another status is different: it requires confirmation and updates Markdown."),
    skills(), folders(),
  ];
  return [
    step("project-switcher", "Switch the current project", "Choose another connected project here. The Alpha Kanban name returns to the start screen."),
    step("document-panel-toggle", "Open your document panel", "Open documents above the board, or pin the panel to the left or bottom. Cards and Details are available in every position."),
    step("document-status-search", "Search from the status bar", "Select the magnifier to search. Results appear in the document panel, using the same search as its input. The input stays open while a search is entered."),
    step("document-set-switcher", "Switch documents in this set", "Select the document type to open its plan, tickets or inventory. The menu includes this set’s documents even when the document list is filtered."),
    step("project-owner-filter", "Filter documents by owner", "Choose an owner here without opening the document panel. This uses the same owner filter as the panel and leaves the open document unchanged."),
    step("document-panel-layout", "Arrange your document panel", "Choose the panel position and Cards or Details here. Unpin to float above the board. Drag the panel edges to resize; double-click a resize handle to reset its size."),
    step("documents", "Search this project’s documents", "Search names, paths and the contents of plans, tickets, inventories and other Markdown. Results stay grouped by document set."),
    step("document-results", "Open a matching document set", "A match shows which document or ticket contains the text. Selecting it opens the matching tickets or the matching place in the document."),
    step("applied-document-search", "Keep or clear the search", "The opened document keeps the applied search. View whole document clears that view’s search without erasing the document search. Clear the document search separately to see every document set."),
    step("document-filters", "Keep the document list focused", "Hide plain Markdown or completed document sets. If the project has owner folders, you can also filter by owner. These choices only change the document list, not the documents."),
    step("document-sort", "Choose a document order", "Sort by document number, recent changes, or progress. The arrow reverses the order. This is a viewing preference, not a file edit."),
    step("document-view", "Switch between board and Markdown", "The board summarizes tickets. Markdown shows the whole document, including text that does not appear on cards. Both views read the same file."),
    step("document-owner", "Ownership comes from the folder", "This owner comes from the nearest @ folder. Use the document filter to choose an owner; this does not change the Owner recorded inside a file."),
    step("document-properties", "Read the recorded properties", "Owner is the name recorded in this file. Folder ownership is determined separately by the nearest @ folder. Document-ID identifies the file even after a move."),
    step("document-maintenance", "Preview document maintenance", "Keep a document you continue to use aligned with the current format. Preview missing ID assignment, Owner correction to the nearest @ folder, and removal of obsolete guidance and templates. Only Apply reviewed changes saves this document."),
    step("project-guide", "Create your first plan and tickets", "Use these example requests in your AI tool. Review the draft, discuss relevant open questions, update the tickets, and then request implementation. Ordinary Markdown remains available in the document panel."),
    status(), card(),
    step("all-tickets", "See work across projects", "Open All tickets to compare connected projects on one board and filter the projects you want to see."),
    skills(), folders(),
  ];
}

export function isTourTargetVisible(element: HTMLElement): boolean {
  return !element.closest("[hidden], [aria-hidden=\"true\"]") && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
}

export function availableTourSteps(kind: TourKind, t: TFunction, root: ParentNode = document): DriveStep[] {
  return tourSteps(kind, t).flatMap((step) => {
    const element = Array.from(root.querySelectorAll<HTMLElement>(step.element as string))
      .find(isTourTargetVisible);
    return element ? [{ ...step, element }] : [];
  });
}

// Shared by the browser, standalone helpers and packaging. No filesystem access.
export const LEDGER_CONTRACT = Object.freeze({
  skillRevision: "1",
  readFormats: ["unversioned", "1"],
  writeFormats: ["unversioned", "1"],
  newDocumentFormat: "unversioned",
  formatField: "Ledger-Format",
  updateUrl: "https://kanban.giveit2.me/intro#updates",
});

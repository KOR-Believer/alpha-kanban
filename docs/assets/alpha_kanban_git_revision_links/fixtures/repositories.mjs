import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { devNull } from "node:os";
import { createRevisionCitation } from "../../../../scripts/lib/revision-citation.mjs";

export function git(cwd, ...args) {
  return execFileSync("git", ["-c", "user.name=Smoke", "-c", "user.email=smoke@example.invalid",
    "-c", "commit.gpgSign=false", "-c", "core.autocrlf=false", "-C", cwd, ...args],
    { encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_NOSYSTEM: "1" } }).trimEnd();
}

export function revisionFixture(root, { pack = false, large = false } = {}) {
  function write(repo, name, content) { const file = join(repo, name); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, content); }
  function repo(name, origin) {
    const directory = join(root, name);
    mkdirSync(directory, { recursive: true });
    git(directory, "init", "-q", "-b", "main");
    if (origin) git(directory, "remote", "add", "origin", origin);
    return directory;
  }
  function commit(directory, title) {
    git(directory, "add", "-A"); git(directory, "commit", "-qm", title);
    return git(directory, "rev-parse", "HEAD");
  }
  const code = repo("evidence", "git@gitlab.com:example/team/evidence.git");
  write(code, "src/rule.ts", "export const windowDays = 7;\nexport const exception = 'damaged seal';\n");
  write(code, "policies/refund.md", "# Unrelated copy\n\nWrong checkout\n");
  const audit = Array.from({length: 400}, (_, i) => "Audit criterion " + i + " — verify the original evidence.").join("\n") + "\n";
  write(code, "src/audit.txt", audit);
  const codeOid = commit(code, "Evidence");
  git(code, "update-ref", "refs/remotes/origin/main", codeOid);
  const explicit = createRevisionCitation({ repo: code, file: "src/rule.ts", lines: "1-2", label: "Source rule", "web-label": "Web original" });

  const policy = repo("policy", "git@github.com:example/team-policy.git");
  const image = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");
  const documentPath = "policies/refund.md";
  write(policy, documentPath, "# Refund policy\n\n## Deadline\n\nSeven days after approval.\n\n[Details](./more/terms.md) · [Removed](./gone.md) · [Current only](./new.md)\n\n" + explicit.markdown + "\n");
  write(policy, "policies/more/terms.md", "# Terms\n\n## Exception\n\nA damaged seal is exempt on day seven.\n\n![Seal](./seal.gif)\n\n[Return to clause](../refund.md#deadline) · [This clause](#exception)\n");
  write(policy, "policies/more/seal.gif", image);
  write(policy, "policies/gone.md", "# Archived clause\n");
  write(policy, "한 글/(#%).md", "# Same\n\n```md\n# Ignored\n```\n\nSame\n----\n");
  const tickets = "# Refund review\n\n## Status\n\n- 현재 진행률: `0 / 1 tickets`\n\n## Ticket List\n\n### RF-01. Check the refund window\n\nStatus: READY\nProgress: 25%\nRepository:\n\n- policy\n\nPriority: P1\nType: Feature\nDepends on:\n\n- 없음\n\n목표:\n\n- Verify the seven-day rule.\n";
  const definitionId = "bea344d4-f9f5-489c-a55d-d67e0b7444a4";
  const tc = "### TC-001. Open the refund clause\n\nRevision: 1\n\nLifecycle: ACTIVE\n\nSummary: Read the seven-day clause.\n\nChange reason: Initial case\n";
  const steps = "\n#### 사전조건\n\n- Repository open\n\n#### 수행 절차\n\n1. Open the clause.\n\n#### 기대 결과\n\n- Seven days.\n";
  const smoke = "# Refund checks\n\nDocument-ID: " + definitionId + "\n\n## 메모\n\nTest the recorded policy.\n\n## Test Cases\n\n" + tc + steps;
  const run = "# Refund checks, run one\n\nDocument-ID: 58b7a598-3027-4834-adef-bc28fa27ac41\n\nSmoke-Document-ID: " + definitionId
    + "\n\nSmoke-Title: Refund checks\n\nSmoke-Path: policies/02_refund_smoke.md\n\nRun: 1\n\nRun-State: OPEN\n\nTarget: Demo\n\nEnvironment: Browser\n\nCreated at: 2026-11-01T09:00:00Z\n\n## 메모\n\nReview notes.\n\n## 실행 당시 공통 조건\n\nTest the recorded policy.\n\n## Test Cases\n\n"
    + tc + "\nResult: PASS\n" + steps + "\n#### 기록\n";
  write(policy, "policies/01_refund_tickets.md", tickets);
  write(policy, "policies/02_refund_smoke.md", smoke);
  write(policy, "policies/03_refund_smoke_run.md", run);
  if (large) {
    // Tiny current image, historic regular file above the Git blob transfer limit.
    write(policy, "policies/more/large.gif", Buffer.concat([image, Buffer.alloc(10 * 1024 * 1024)]));
    const data = Buffer.alloc(4 * 1024 * 1024);
    let state = 37;
    for (let i = 0; i < data.length; i++) { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; data[i] = state & 255; }
    write(policy, "pack-size-fixture.bin", data);
  }
  const old = commit(policy, "Seven-day policy");
  git(policy, "update-ref", "refs/remotes/origin/main", old);
  const citation = createRevisionCitation({ repo: policy, file: documentPath, heading: "Deadline", label: "Refund basis", "web-label": "Web original" });
  write(policy, documentPath, "# Refund policy\n\n## Deadline\n\nTen days after approval.\n");
  write(policy, "policies/more/terms.md", "# Today's terms\n");
  const changed = Buffer.from(image); changed.set([255, 0, 0, 255, 0, 0], 13);
  write(policy, "policies/more/seal.gif", changed);
  unlinkSync(join(policy, "policies/gone.md")); write(policy, "policies/new.md", "# Current-only clause\n");
  write(policy, "policies/01_refund_tickets.md", tickets.replace("Status: READY", "Status: DONE").replace("25%", "100%"));
  write(policy, "policies/02_refund_smoke.md", smoke.replace("seven-day clause", "ten-day clause"));
  write(policy, "policies/03_refund_smoke_run.md", run.replace("Result: PASS", "Result: FAIL"));
  if (large) write(policy, "policies/more/large.gif", changed);
  const latest = commit(policy, "Ten-day policy");
  const record = "# Decision record\n\n" + citation.markdown + "\n\n" + explicit.markdown
    + "\n\n[Reference pair][local] · [Web original][web]\n\n[local]: " + citation.href + "\n[web]: " + citation.web
    + "\n\n[Normal link](https://example.com/) · [Old PC policy](file:///previous-computer/refunds/policies/refund.md)\n";
  write(code, "docs/01_decision_plan.md", record);
  write(code, "src/audit.txt", audit.replace("Audit criterion 175", "Revised criterion 175"));
  commit(code, "Record the evidence");
  if (pack) git(policy, "gc", "--prune=now", "--quiet");
  return { policy, code, old, latest, codeOid, citation, explicit, record, image };
}

import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";

export async function writeBoundaryFixtures(output) {
  const git = (name) => `[core]\nrepositoryformatversion = 0\n[remote "origin"]\nurl = https://example.invalid/team/${name}.git\n`;
  const files = {
    "complete/source/docs/context.md": "# Source\n",
    "complete/top-repo/.git/config": git("top"),
    "complete/top-repo/docs/guide.md": "ROOT REPO CORRECT\n",
    "complete/harness/.git/config": git("harness"),
    "complete/harness/.git/worktrees/linked/commondir": "../..\n",
    "complete/harness/docs/guide.md": "WRONG PARENT REPO\n",
    "complete/harness/unknown/.git": "gitdir: /outside-the-grant/metadata.git\n",
    "complete/harness/unknown/docs/guide.md": "UNKNOWN BOUNDARY CORRECT\n",
    "complete/linked/.git": "gitdir: ../harness/.git/worktrees/linked\n",
    "complete/linked/docs/guide.md": "LINKED WORKTREE CORRECT\n",
    "complete/no-remote/.git/config": "[core]\nrepositoryformatversion = 0\n",
    "complete/no-remote/docs/guide.md": "NO REMOTE CORRECT\n",
    "limited/source/docs/context.md": "# Source\n",
    "limited/target/.git/config": git("target"),
    "limited/target/docs/guide.md": "LIMITED MANUAL CORRECT\n",
    [`limited/${Array.from({ length: 22 }, (_, i) => `depth-${i}`).join("/")}/leaf.md`]: "DEPTH LIMIT\n",
  };
  const hashes = {};
  for (const [name, content] of Object.entries(files)) {
    const path = "boundary-fixtures/" + name;
    await mkdir(dirname(resolve(output, path)), { recursive: true });
    await writeFile(resolve(output, path), content, { flag: "wx" });
    hashes[path] = createHash("sha256").update(content).digest("hex");
  }
  return hashes;
}

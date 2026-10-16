import { describe, expect, it } from "vitest";
import { resolveWorkspaceProject } from "../workspaces";

describe("workspace project identity", () => {
  it("uses the first directory beneath the most specific registered root", () => {
    const roots = ["/home/me", "/home/me/workspace"];
    const project = resolveWorkspaceProject("/home/me/workspace/sparkone/apps/crew-admin", roots)!;
    expect(project).toMatchObject({ label: "sparkone", root: "/home/me/workspace/sparkone", workspaceRoot: roots[1] });
    expect(resolveWorkspaceProject("/home/me/workspace/sparkone", roots)?.id).toBe(project.id);
    expect(resolveWorkspaceProject("/home/me/workspace/sparkone/apps/crew-admin", [...roots].reverse())).toEqual(project);
    expect(resolveWorkspaceProject("/home/me/workspace/sparkone/apps/crew-admin", [...roots, "/home/me/workspace/sparkone/apps"])?.label).toBe("crew-admin");
  });
  it("keeps same names in different roots distinct and handles the root itself", () => {
    const roots = ["/work", "/personal"];
    expect(resolveWorkspaceProject("/work/project", roots)?.id).not.toBe(resolveWorkspaceProject("/personal/project", roots)?.id);
    expect(resolveWorkspaceProject("/work", roots)).toMatchObject({ root: "/work", label: "work" });
    expect(resolveWorkspaceProject("/workspace/project", roots)).toBeUndefined();
  });
});

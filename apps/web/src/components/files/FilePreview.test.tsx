// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import FilePreview from "./FilePreview";

it("releases each image/PDF URL when changing files or leaving the preview", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let sequence = 0;
  const create = vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:preview-${++sequence}`);
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const host = document.createElement("div"), root = createRoot(host);
  const readResource = vi.fn();
  try {
    await act(async () => root.render(<FilePreview file={new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], "image.svg")} path="image.svg" readResource={readResource} />));
    expect(host.querySelector("img")?.src).toBe("blob:preview-1");
    await act(async () => root.render(<FilePreview file={new File(["%PDF-1.4\n"], "document.pdf")} path="document.pdf" readResource={readResource} />));
    expect(revoke.mock.calls).toEqual([["blob:preview-1"]]);
    expect(host.querySelector("iframe")?.src).toBe("blob:preview-2");
    await act(async () => root.unmount());
    expect(create).toHaveBeenCalledTimes(2);
    expect(revoke.mock.calls).toEqual([["blob:preview-1"], ["blob:preview-2"]]);
    expect(readResource).not.toHaveBeenCalled();
  } finally { vi.restoreAllMocks(); vi.unstubAllGlobals(); }
});

it("offers downloading without mounting a PDF frame when the browser disables its viewer", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const descriptor = Object.getOwnPropertyDescriptor(navigator, "pdfViewerEnabled");
  Object.defineProperty(navigator, "pdfViewerEnabled", { configurable: true, value: false });
  const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:disabled");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const host = document.createElement("div"), root = createRoot(host);
  try {
    await act(async () => root.render(<FilePreview file={new File(["%PDF-1.4\n"], "file.pdf")} path="file.pdf" readResource={vi.fn()} />));
    expect(host.querySelector("iframe")).toBeNull();
    expect(host.querySelector("button")).not.toBeNull();
    expect(host.querySelector(".ak-file-preview-message")?.textContent).toBeTruthy();
  } finally {
    await act(async () => root.unmount());
    expect(create).toHaveBeenCalledTimes(1); expect(revoke).toHaveBeenCalledWith("blob:disabled");
    if (descriptor) Object.defineProperty(navigator, "pdfViewerEnabled", descriptor); else Reflect.deleteProperty(navigator, "pdfViewerEnabled");
    vi.restoreAllMocks(); vi.unstubAllGlobals();
  }
});

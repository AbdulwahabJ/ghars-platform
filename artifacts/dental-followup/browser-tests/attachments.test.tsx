import { describe, expect, it, vi } from "vitest";
import { page } from "@vitest/browser/context";
import { patientAttachmentMimeForFile } from "../src/components/patients/attachments/upload-utils";
import { CompactAttachments } from "../src/components/patients/attachments/CompactAttachments";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PatientAttachment } from "@workspace/shared";

const mockAttachments = Array.from({ length: 20 }, (_, i) => ({
  id: `att-${i}`,
  patientId: "pat-1",
  implantCaseId: null,
  title: `File ${i}`,
  category: i % 2 === 0 ? "RADIOLOGY" : "OTHER",
  note: "",
  fileDate: null,
  originalFilename: `file${i}.${i % 2 === 0 ? 'jpg' : 'pdf'}`,
  mimeType: i % 2 === 0 ? "image/jpeg" : "application/pdf",
  fileSize: 1024,
  uploadedBy: "u-1",
  uploadedByName: "User",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
})) as unknown as PatientAttachment[];

import * as attachmentsHooks from "../src/hooks/use-attachments";
import { createRoot } from "react-dom/client";
import { LocaleProvider } from "../src/i18n/LocaleProvider";

vi.mock("../src/hooks/use-attachments", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    usePatientAttachments: vi.fn(),
  };
});


describe("patientAttachmentMimeForFile", () => {
  it("resolves jpg to image/jpeg", () => {
    const file = new File([""], "test.jpg", { type: "image/jpeg" });
    expect(patientAttachmentMimeForFile(file)).toBe("image/jpeg");
  });

  it("resolves png to image/png", () => {
    const file = new File([""], "test.png", { type: "image/png" });
    expect(patientAttachmentMimeForFile(file)).toBe("image/png");
  });

  it("resolves pdf to application/pdf", () => {
    const file = new File([""], "document.pdf", { type: "application/pdf" });
    expect(patientAttachmentMimeForFile(file)).toBe("application/pdf");
  });

  it("returns null for unsupported types", () => {
    const file = new File([""], "document.txt", { type: "text/plain" });
    expect(patientAttachmentMimeForFile(file)).toBeNull();
  });
  
  it("returns null if extension mismatches declared type", () => {
    const file = new File([""], "test.jpg", { type: "text/plain" });
    expect(patientAttachmentMimeForFile(file)).toBeNull();
  });
});

describe("CompactAttachments", () => {
  it("keeps a 20-item collection compact and filters the metadata-only View All dialog", async () => {
    // Mock the hook
    const usePatientAttachmentsSpy = attachmentsHooks.usePatientAttachments as any;
    usePatientAttachmentsSpy.mockReturnValue({
      data: { attachments: mockAttachments },
      isLoading: false,
      refetch: vi.fn(),
    } as any);

    const queryClient = new QueryClient();

    const div = document.createElement("div");
    document.body.appendChild(div);
    const root = createRoot(div);
    root.render(
      <QueryClientProvider client={queryClient}><LocaleProvider>
        <CompactAttachments patientId="pat-1" canDelete={true} />
      </LocaleProvider></QueryClientProvider>
    );

    // Should only render 6 main thumbnails (the images will be img tags, pdfs will be icons)
    // Actually the component renders exactly 6 items in the visible attachments array
    // plus a 7th box for the "+14" indicator.
    
    // Wait for render
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should only render 6 main thumbnails
    const images = div.querySelectorAll("img");
    expect(images.length).toBe(3); // 0, 2, 4 are imgs
    
    // Check for the overflow indicator
    expect(div.textContent).toContain("+14");

    const overflow = Array.from(div.querySelectorAll("div")).find((element) => element.textContent?.trim() === "+14");
    overflow?.click();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement | null;
    expect(dialog?.textContent).toContain("File 19");

    const select = dialog?.querySelector('[role="combobox"]') as HTMLElement | null;
    select?.click();
    await new Promise((resolve) => setTimeout(resolve, 25));
    const radiologyOption = Array.from(document.body.querySelectorAll('[role="option"]')).find(
      (element) => element.textContent?.includes("أشعة"),
    ) as HTMLElement | undefined;
    radiologyOption?.click();
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(dialog?.textContent).toContain("File 18");
    expect(dialog?.textContent).not.toContain("File 19");
    
    root.unmount();
    document.body.removeChild(div);
  });
});

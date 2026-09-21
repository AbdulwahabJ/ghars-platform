import type { PatientAttachmentCategory, PatientAttachmentMime } from "@workspace/shared";

const MIME_BY_EXTENSION: Record<string, PatientAttachmentMime> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

export function patientAttachmentMimeForFile(file: File): PatientAttachmentMime | null {
  const extension = file.name.toLowerCase().split(".").pop();
  if (!extension) return null;
  const expectedMime = MIME_BY_EXTENSION[extension];
  return expectedMime && file.type === expectedMime ? expectedMime : null;
}

export interface StagedFile {
  id: string;
  file: File;
  contentType: PatientAttachmentMime;
  title: string;
  category: PatientAttachmentCategory | null;
  note: string;
  fileDate: string;
  implantCaseId: string | null;
  status: "idle" | "uploading" | "success" | "error";
  progress: number;
  errorMessage?: string;
  previewUrl?: string;
  uploadToken?: string;
  objectPath?: string;
}

export function uploadFileWithProgress(
  url: string,
  file: File,
  contentType: PatientAttachmentMime,
  onProgress: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(file);
  });
}

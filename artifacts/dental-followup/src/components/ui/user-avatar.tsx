import React, { useRef } from "react";
import { cn } from "@/lib/utils";

/** Max file size accepted on the client before resizing (2 MB raw bytes). */
export const MAX_AVATAR_RAW_BYTES = 2 * 1024 * 1024;

/** Target canvas size for client-side resize. */
const AVATAR_CANVAS_SIZE = 512;

const ACCEPTED_MIME = ["image/png", "image/jpeg", "image/webp"];

/** Extract up to two initials from a full name (Arabic or English). */
export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "؟";
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  // Use first letter of first word + first letter of last word.
  return (
    words[0].charAt(0).toUpperCase() +
    words[words.length - 1].charAt(0).toUpperCase()
  );
}

/**
 * Resize an image File to a square JPEG data URL at AVATAR_CANVAS_SIZE.
 * Uses a temporary canvas — no external library required.
 */
export function resizeAvatarToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("قراءة الملف فشلت."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("تحميل الصورة فشل."));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = AVATAR_CANVAS_SIZE;
        canvas.height = AVATAR_CANVAS_SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas غير متاح."));
          return;
        }
        // Crop to square from center then scale to target size.
        const { naturalWidth: sw, naturalHeight: sh } = img;
        const side = Math.min(sw, sh);
        const sx = (sw - side) / 2;
        const sy = (sh - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_CANVAS_SIZE, AVATAR_CANVAS_SIZE);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/* ------------------------------------------------------------------ */
/* UserAvatar display component                                         */
/* ------------------------------------------------------------------ */

interface UserAvatarProps {
  fullName: string;
  avatarData?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  /** Extra ring style, e.g. brand teal ring for hero use. */
  ring?: boolean;
}

const SIZE_CLASSES: Record<NonNullable<UserAvatarProps["size"]>, string> = {
  xs: "h-7 w-7 text-[11px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-xl",
  xl: "h-24 w-24 text-3xl",
};

export function UserAvatar({
  fullName,
  avatarData,
  size = "md",
  className,
  ring = false,
}: UserAvatarProps) {
  const initials = getInitials(fullName);

  return (
    <div
      className={cn(
        "rounded-full overflow-hidden flex items-center justify-center shrink-0 select-none font-semibold",
        SIZE_CLASSES[size],
        !avatarData && "bg-primary/15 text-primary",
        ring &&
          "ring-2 ring-offset-2 ring-primary/50 shadow-[0_0_14px_2px_rgba(13,148,136,0.25)]",
        className,
      )}
    >
      {avatarData ? (
        <img
          src={avatarData}
          alt={fullName}
          className="w-full h-full object-cover"
          draggable={false}
        />
      ) : (
        <span className="notranslate leading-none">{initials}</span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* AvatarUploader — upload / preview / replace / remove                */
/* ------------------------------------------------------------------ */

interface AvatarUploaderProps {
  value: string | null;
  onChange: (v: string | null) => void;
  onError: (msg: string) => void;
}

export function AvatarUploader({ value, onChange, onError }: AvatarUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPTED_MIME.includes(file.type)) {
      onError("صيغة الصورة غير مدعومة. الرجاء اختيار PNG أو JPEG أو WebP.");
      return;
    }
    if (file.size > MAX_AVATAR_RAW_BYTES) {
      onError("حجم الملف كبير جدًا. الحد الأقصى 2 ميغابايت.");
      return;
    }
    try {
      const dataUrl = await resizeAvatarToDataUrl(file);
      // Guard: after JPEG encode at 85% the result should fit well under 1.4 MB
      if (dataUrl.length > 1_400_000) {
        onError("الصورة كبيرة جدًا بعد المعالجة. الرجاء اختيار صورة أصغر.");
        return;
      }
      onChange(dataUrl);
    } catch {
      onError("تعذّر معالجة الصورة. الرجاء المحاولة مرة أخرى.");
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Circular preview */}
      <div className="relative">
        <div className="h-24 w-24 rounded-full overflow-hidden border-2 border-dashed border-border flex items-center justify-center bg-muted">
          {value ? (
            <img
              src={value}
              alt="صورة الملف الشخصي"
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-xs text-muted-foreground text-center px-2">
              لا توجد صورة
            </span>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          {value ? "تغيير الصورة" : "رفع صورة"}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            إزالة
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={(e) => handleFile(e.target.files?.[0])}
        // Reset so same file can be re-selected after removal.
        onClick={(e) => ((e.currentTarget as HTMLInputElement).value = "")}
      />
    </div>
  );
}

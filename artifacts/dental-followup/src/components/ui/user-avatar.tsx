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
 * Whether the source image format can carry an alpha channel.
 * Only PNG and WebP support transparency; JPEG does not.
 */
function hasAlphaChannel(file: File): boolean {
  return file.type === "image/png" || file.type === "image/webp";
}

/**
 * Resize an image File to a data URL at most AVATAR_CANVAS_SIZE on its
 * longest side, preserving aspect ratio.
 *
 * Transparency preservation rule:
 *   - PNG / WebP source → output as WebP (alpha-safe); canvas is NOT filled
 *     with any background colour so transparent pixels remain transparent.
 *   - JPEG source → output as JPEG (no alpha channel needed).
 *
 * Uses a temporary canvas — no external library required.
 */
export function resizeAvatarToDataUrl(file: File): Promise<string> {
  const alpha = hasAlphaChannel(file);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("قراءة الملف فشلت."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("تحميل الصورة فشل."));
      img.onload = () => {
        const { naturalWidth: sw, naturalHeight: sh } = img;
        // Clamp the longest side to AVATAR_CANVAS_SIZE, keep aspect ratio.
        const scale = Math.min(1, AVATAR_CANVAS_SIZE / Math.max(sw, sh));
        const tw = Math.round(sw * scale);
        const th = Math.round(sh * scale);

        const canvas = document.createElement("canvas");
        canvas.width = tw;
        canvas.height = th;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas غير متاح."));
          return;
        }
        // Do NOT fill the background — keeps alpha channel transparent.
        ctx.drawImage(img, 0, 0, tw, th);

        // Use WebP for alpha sources (JPEG kills transparency by design).
        const outType = alpha ? "image/webp" : "image/jpeg";
        const quality = alpha ? 0.92 : 0.85;
        resolve(canvas.toDataURL(outType, quality));
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
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "hero";
  className?: string;
  /** Extra ring style, e.g. brand teal ring for hero use. */
  ring?: boolean;
  /** Use the organic vertical frame or frameless treatment reserved for the dashboard hero. */
  shape?: "circle" | "portrait" | "frameless";
  /** Keep the source image complete when the frame should avoid aggressive cropping. */
  imageFit?: "cover" | "contain" | "natural";
}

const SIZE_CLASSES: Record<NonNullable<UserAvatarProps["size"]>, string> = {
  xs: "h-7 w-7 text-[11px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-xl",
  xl: "h-24 w-24 text-3xl",
  hero: "h-[140px] w-[112px] text-4xl sm:h-[170px] sm:w-[136px] md:h-[250px] md:w-[200px] lg:h-[300px] lg:w-[240px] xl:h-[320px] xl:w-[256px]",
};

export function UserAvatar({
  fullName,
  avatarData,
  size = "md",
  className,
  ring = false,
  shape = "circle",
  imageFit = "cover",
}: UserAvatarProps) {
  const initials = getInitials(fullName);

  // Frameless is reserved for the dashboard hero: with no photo, render
  // nothing at all (no placeholder, no initials, no empty badge).
  if (shape === "frameless" && !avatarData) {
    return null;
  }

  return (
    <div
      className={cn(
        shape === "circle"
          ? "rounded-full"
          : shape === "portrait"
          ? "hero-portrait-frame"
          : "hero-portrait-frameless",
        shape === "frameless" ? "overflow-visible" : "overflow-hidden",
        "flex items-center justify-center shrink-0 select-none font-semibold",
        SIZE_CLASSES[size],
        !avatarData && shape !== "frameless" && "bg-primary/15 text-primary",
        ring &&
          "ring-2 ring-offset-2 ring-primary/50 shadow-[0_0_14px_2px_rgba(13,148,136,0.25)]",
        className,
      )}
    >
      {avatarData ? (
        <img
          src={avatarData}
          alt={fullName}
          className={cn(
            imageFit === "natural"
              ? "h-auto w-auto max-h-full max-w-full"
              : "h-full w-full",
            imageFit === "cover" ? "object-cover" : "object-contain",
          )}
          draggable={false}
        />
      ) : shape === "frameless" ? null : (
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

import type { Response } from "express";
import type { z } from "zod";

/**
 * Parse a request payload with a shared Zod schema. On failure, responds
 * with 400 and the first (Arabic) validation message, and returns undefined.
 */
export function parseOrRespond<Schema extends z.ZodTypeAny>(
  schema: Schema,
  payload: unknown,
  res: Response,
): z.output<Schema> | undefined {
  const result = schema.safeParse(payload);
  if (!result.success) {
    res.status(400).json({
      error:
        result.error.issues[0]?.message ??
        "البيانات المدخلة غير صحيحة. يرجى التحقق والمحاولة مرة أخرى.",
      code: "VALIDATION_ERROR",
    });
    return undefined;
  }
  return result.data;
}

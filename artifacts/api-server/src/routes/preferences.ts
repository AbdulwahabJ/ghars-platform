import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, userPreferencesTable } from "@workspace/db";
import { updatePreferencesInputSchema } from "@workspace/shared";
import { writeAudit } from "../lib/audit";
import { parseOrRespond } from "../lib/validation";
import { requireAuth } from "../middlewares/auth";
import { getOrCreatePreferences, toPreferencesDto } from "./auth";

const router: IRouter = Router();

router.patch("/preferences", requireAuth, async (req, res) => {
  const input = parseOrRespond(updatePreferencesInputSchema, req.body, res);
  if (!input) return;

  const user = req.currentUser!;
  await getOrCreatePreferences(user.id);

  const now = new Date();
  const [updated] = await db
    .update(userPreferencesTable)
    .set({
      onboardingStatus: input.onboardingStatus,
      onboardingCompletedAt:
        input.onboardingStatus === "completed" ? now : undefined,
      onboardingSkippedAt:
        input.onboardingStatus === "skipped" ? now : undefined,
      updatedAt: now,
    })
    .where(eq(userPreferencesTable.userId, user.id))
    .returning();

  if (!updated) {
    res.status(500).json({
      error: "تعذر حفظ التفضيلات. يرجى المحاولة مرة أخرى.",
      code: "INTERNAL",
    });
    return;
  }

  // Onboarding status change is logged without private activity details.
  await writeAudit({
    userId: user.id,
    action: "onboarding_status_change",
    entityType: "user_preferences",
    entityId: updated.id,
    summary: `حالة الجولة التعريفية: ${input.onboardingStatus}`,
  });

  res.json({ preferences: toPreferencesDto(updated) });
});

export default router;

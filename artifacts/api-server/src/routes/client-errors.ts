import rateLimit from "express-rate-limit";
import { Router, type IRouter } from "express";
import { z } from "zod";
import { recordClientSystemError } from "../lib/system-errors";

const router: IRouter = Router();

const clientErrorLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many client error reports.", code: "RATE_LIMITED" },
});

const clientErrorSchema = z.object({
  route: z.string().startsWith("/").max(500),
  errorName: z.string().min(1).max(120),
  errorMessage: z.string().min(1).max(500),
  componentStack: z.string().max(4_000).optional(),
  buildVersion: z.string().min(1).max(160),
  occurredAt: z.string().datetime(),
});

router.post("/client-errors", clientErrorLimiter, async (req, res) => {
  const parsed = clientErrorSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid client error report.", code: "VALIDATION_ERROR" });
    return;
  }

  await recordClientSystemError(req, parsed.data);
  res.status(204).end();
});

export default router;
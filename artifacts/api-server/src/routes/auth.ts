import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import {
  db,
  emailVerificationTokensTable,
  passwordResetTokensTable,
  platformAdminsTable,
  sessionsTable,
  tenantMembershipsTable,
  tenantOwnerEmailClaimsTable,
  tenantsTable,
  userPreferencesTable,
  usersTable,
  type UserPreferences,
} from "@workspace/db";
import {
  changeOwnPasswordInputSchema,
  completePasswordResetInputSchema,
  forcedPasswordChangeInputSchema,
  emailVerificationInputSchema,
  loginInputSchema,
  passwordResetRequestInputSchema,
  publicRegistrationInputSchema,
  resendVerificationInputSchema,
  setupInputSchema,
  switchTenantInputSchema,
  type Preferences,
} from "@workspace/shared";
import { writeAudit } from "../lib/audit";
import {
  isPasswordResetEmailConfigured,
  sendPasswordResetEmail,
} from "../lib/password-reset-email";
import {
  isVerificationEmailConfigured,
  sendVerificationEmail,
} from "../lib/verification-email";
import { toPublicUser } from "../lib/permissions";
import { parseOrRespond } from "../lib/validation";
import {
  loadUserTenantContext,
  requireAuth,
  toTenantSummary,
} from "../middlewares/auth";

const router: IRouter = Router();

const GENERIC_LOGIN_ERROR = "اسم المستخدم أو كلمة المرور غير صحيحة.";
const BCRYPT_ROUNDS = 12;
const PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const PASSWORD_RESET_GENERIC_MESSAGE =
  "إذا كانت بيانات الحساب مطابقة ويوجد بريد إلكتروني مسجل، فسيصل رابط إعادة التعيين خلال دقائق.";
const VERIFICATION_TOKEN_TTL_MS = 30 * 60 * 1000;
import { loadPlatformSettings } from "../lib/platform-settings";

/** Constant-cost comparison target when the username does not exist. */
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
  "timing-equalizer-not-a-real-password",
  BCRYPT_ROUNDS,
);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "عدد محاولات تسجيل الدخول كبير. يرجى المحاولة بعد قليل.",
    code: "RATE_LIMITED",
  },
});

const setupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "عدد المحاولات كبير. يرجى المحاولة لاحقًا.",
    code: "RATE_LIMITED",
  },
});

const passwordResetRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "عدد طلبات الاستعادة كبير. يرجى المحاولة لاحقًا.",
    code: "RATE_LIMITED",
  },
});

const passwordResetCompleteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "عدد محاولات إعادة التعيين كبير. يرجى المحاولة لاحقًا.",
    code: "RATE_LIMITED",
  },
});
const registrationLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false, message: { error: "عدد المحاولات كبير. يرجى المحاولة لاحقًا.", code: "RATE_LIMITED" } });
const verificationLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 15, standardHeaders: true, legacyHeaders: false, message: { error: "عدد المحاولات كبير. يرجى المحاولة لاحقًا.", code: "RATE_LIMITED" } });
const resendVerificationLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false, message: { error: "عدد المحاولات كبير. يرجى المحاولة لاحقًا.", code: "RATE_LIMITED" } });

function timingSafeStringEqual(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a, "utf8").digest();
  const hashB = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(hashA, hashB);
}

function hashPasswordResetToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
function hashVerificationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

async function adminExists(): Promise<boolean> {
  const [row] = await db
    .select({ id: platformAdminsTable.userId })
    .from(platformAdminsTable)
    .limit(1);
  return !!row;
}

function toPreferencesDto(row: UserPreferences): Preferences {
  return {
    locale: row.locale,
    onboardingStatus: row.onboardingStatus,
    onboardingCompletedAt: row.onboardingCompletedAt?.toISOString() ?? null,
    onboardingSkippedAt: row.onboardingSkippedAt?.toISOString() ?? null,
  };
}

export async function getOrCreatePreferences(
  userId: string,
): Promise<UserPreferences> {
  await db
    .insert(userPreferencesTable)
    .values({ userId })
    .onConflictDoNothing({ target: userPreferencesTable.userId });
  const [row] = await db
    .select()
    .from(userPreferencesTable)
    .where(eq(userPreferencesTable.userId, userId))
    .limit(1);
  if (!row) {
    throw new Error("failed to load user preferences");
  }
  return row;
}

export { toPreferencesDto };

router.get("/auth/setup-status", async (_req, res) => {
  res.json({ setupRequired: !(await adminExists()) });
});

router.post("/auth/setup", setupLimiter, async (req, res) => {
  const input = parseOrRespond(setupInputSchema, req.body, res);
  if (!input) return;

  const expectedKey = process.env.INITIAL_SETUP_KEY;
  if (!expectedKey) {
    res.status(500).json({
      error: "الإعداد الأولي غير مهيأ على الخادم.",
      code: "SETUP_NOT_CONFIGURED",
    });
    return;
  }

  if (await adminExists()) {
    res.status(403).json({
      error: "تم إعداد النظام مسبقًا ولا يمكن تنفيذ الإعداد مرة أخرى.",
      code: "SETUP_DISABLED",
    });
    return;
  }

  if (!timingSafeStringEqual(input.setupKey, expectedKey)) {
    res
      .status(403)
      .json({ error: "مفتاح الإعداد غير صحيح.", code: "INVALID_SETUP_KEY" });
    return;
  }

  const username = input.username.toLowerCase();
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const created = await db.transaction(async (tx) => {
    // Re-check inside the transaction to close the race window.
    const [existingAdmin] = await tx
      .select({ id: platformAdminsTable.userId })
      .from(platformAdminsTable)
      .limit(1);
    if (existingAdmin) return null;

    const [user] = await tx
      .insert(usersTable)
      .values({
        username,
        email: input.email ?? null,
        passwordHash,
        fullName: input.fullName,
        role: "ADMIN",
      })
      .returning();
    if (!user) throw new Error("failed to create admin user");
    await tx.insert(platformAdminsTable).values({ userId: user.id });
    await tx.insert(userPreferencesTable).values({ userId: user.id });
    await writeAudit(
      {
        tenantId: null,
        userId: user.id,
        action: "user_create",
        entityType: "user",
        entityId: user.id,
        summary: "إنشاء حساب المدير الأول عبر الإعداد الأولي",
      },
      tx,
    );
    return user;
  });

  if (!created) {
    res.status(403).json({
      error: "تم إعداد النظام مسبقًا ولا يمكن تنفيذ الإعداد مرة أخرى.",
      code: "SETUP_DISABLED",
    });
    return;
  }

  res.status(201).json({
    user: toPublicUser(created, {
      role: "ADMIN",
      canViewFinancials: null,
      canRecordPayments: null,
    }),
  });
});

router.post("/auth/register", registrationLimiter, async (req, res) => {
  const input = parseOrRespond(publicRegistrationInputSchema, req.body, res);
  if (!input) return;
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const platformSettings = await loadPlatformSettings();
  const trialStartedAt = new Date();
  const trialEndsAt = new Date(
    trialStartedAt.getTime() + platformSettings.defaultTrialHours * 60 * 60 * 1000,
  );
  try {
    await db.transaction(async (tx) => {
      const referenceCode = `clinic-${randomBytes(6).toString("hex")}`;
      const [tenant] = await tx.insert(tenantsTable).values({
        referenceCode, name: input.tenantName, legalName: input.legalName ?? null,
        contactName: input.ownerName, contactEmail: input.email ?? null,
        contactPhone: input.phone, city: input.city || null, locale: input.locale,
        status: "TRIAL", trialStartedAt, trialEndsAt,
      }).returning();
      const [user] = await tx.insert(usersTable).values({
        username: input.username, email: input.email ?? null, passwordHash,
        fullName: input.ownerName, role: "ADMIN",
      }).returning();
      await tx.insert(tenantMembershipsTable).values({ tenantId: tenant.id, userId: user.id, role: "ADMIN" });
      await tx.insert(userPreferencesTable).values({ userId: user.id, locale: input.locale });
      await writeAudit({
        tenantId: tenant.id,
        userId: user.id,
        action: "TENANT_REGISTRATION_CREATED",
        entityType: "tenant",
        entityId: tenant.id,
        summary: "إنشاء عيادة وبدء الفترة التجريبية",
        details: { phone: input.phone, trialEndsAt: trialEndsAt.toISOString() },
      }, tx);
    });
  } catch {
    res.status(409).json({ error: "تعذر إنشاء الحساب بهذه البيانات.", code: "REGISTRATION_CONFLICT" });
    return;
  }
  res.status(201).json({
    message: `تم إنشاء الحساب وبدأت الفترة التجريبية لمدة ${platformSettings.defaultTrialHours} ساعة.`,
  });
});

router.post("/auth/verify-email", verificationLimiter, async (_req, res) => {
  res.status(410).json({
    error: "التحقق عبر البريد غير متاح في هذا الإصدار.",
    code: "EMAIL_VERIFICATION_DISABLED",
  });
});

router.post("/auth/resend-verification", resendVerificationLimiter, async (_req, res) => {
  res.status(410).json({
    error: "التحقق عبر البريد غير متاح في هذا الإصدار.",
    code: "EMAIL_VERIFICATION_DISABLED",
  });
});

router.post("/auth/login", loginLimiter, async (req, res) => {
  const input = parseOrRespond(loginInputSchema, req.body, res);
  if (!input) return;

  const username = input.username.toLowerCase();
  const [user] = await db
    .select()
    .from(usersTable)
    .where(
      and(
        eq(sql`lower(${usersTable.username})`, username),
        eq(usersTable.isActive, true),
      ),
    )
    .limit(1);

  const passwordMatches = await bcrypt.compare(
    input.password,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );

  if (!user || !passwordMatches) {
    await writeAudit({
      tenantId: null,
      action: "login_failed",
      entityType: "user",
      summary: "محاولة تسجيل دخول فاشلة",
      details: { username },
    });
    res.status(401).json({ error: GENERIC_LOGIN_ERROR, code: "INVALID_CREDENTIALS" });
    return;
  }

  const tenantContext = await loadUserTenantContext(user.id);
  if (!tenantContext.current && !tenantContext.isPlatformAdmin) {
    res.status(403).json({
      error: "لا توجد عيادة متاحة لهذا الحساب.",
      code: "TENANT_ACCESS_REQUIRED",
    });
    return;
  }

  await new Promise<void>((resolve, reject) =>
    req.session.regenerate((err) => (err ? reject(err) : resolve())),
  );
  req.session.userId = user.id;
  if (tenantContext.current) {
    req.session.tenantId = tenantContext.current.tenant.id;
  }
  await new Promise<void>((resolve, reject) =>
    req.session.save((err) => (err ? reject(err) : resolve())),
  );

  await db
    .update(usersTable)
    .set({ lastLoginAt: new Date() })
    .where(eq(usersTable.id, user.id));

  const preferences = await getOrCreatePreferences(user.id);
  await writeAudit({
    tenantId: tenantContext.current?.tenant.id ?? null,
    userId: user.id,
    action: "login_success",
    entityType: "user",
    entityId: user.id,
    summary: "تسجيل دخول ناجح",
  });

  res.json({
    user: toPublicUser(
      user,
        tenantContext.current?.membership ?? {
          role: "ADMIN",
          canViewFinancials: null,
          canRecordPayments: null,
        },
    ),
    preferences: toPreferencesDto(preferences),
    currentTenant: tenantContext.current
      ? toTenantSummary(tenantContext.current.tenant)
      : null,
    memberships: tenantContext.memberships.map(({ membership, tenant }) => ({
      role: membership.role,
      isActive: membership.isActive,
      canViewFinancialsOverride: membership.canViewFinancials,
      canRecordPaymentsOverride: membership.canRecordPayments,
      tenant: toTenantSummary(tenant),
    })),
    isPlatformAdmin: tenantContext.isPlatformAdmin,
  });
});

router.post(
  "/auth/password-reset/request",
  passwordResetRequestLimiter,
  async (req, res) => {
    const input = parseOrRespond(passwordResetRequestInputSchema, req.body, res);
    if (!input) return;
    res.json({
      message:
        "لإعادة تعيين كلمة المرور، يرجى التواصل مع مسؤول المنشأة. مسؤولو المنشآت يتواصلون مع دعم غرس.",
    });
  },
);

async function issuePasswordReset(identifier: string): Promise<void> {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.isActive, true),
          or(
            eq(sql`lower(${usersTable.username})`, identifier),
            eq(sql`lower(${usersTable.email})`, identifier),
          ),
        ),
      )
      .limit(1);

    if (!user?.email) {
      return;
    }

    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = hashPasswordResetToken(rawToken);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);
    const [resetToken] = await db.transaction(async (tx) => {
      await tx
        .delete(passwordResetTokensTable)
        .where(
          and(
            eq(passwordResetTokensTable.userId, user.id),
            isNull(passwordResetTokensTable.usedAt),
          ),
        );
      const created = await tx
        .insert(passwordResetTokensTable)
        .values({ userId: user.id, tokenHash, expiresAt })
        .returning();
      await writeAudit(
        {
          tenantId: null,
          userId: user.id,
          action: "password_reset_requested",
          entityType: "user",
          entityId: user.id,
          summary: "طلب إعادة تعيين كلمة المرور",
        },
        tx,
      );
      return created;
    });

    try {
      await sendPasswordResetEmail({
        to: user.email,
        fullName: user.fullName,
        token: rawToken,
      });
    } catch (err) {
      // A delivery error must not reveal whether the account exists. Remove the
      // unusable token, keep a safe audit event, and preserve the generic reply.
      await db.transaction(async (tx) => {
        await tx
          .delete(passwordResetTokensTable)
          .where(eq(passwordResetTokensTable.id, resetToken.id));
        await writeAudit(
          {
            tenantId: null,
            userId: user.id,
            action: "password_reset_delivery_failed",
            entityType: "user",
            entityId: user.id,
            summary: "تعذر إرسال رابط إعادة تعيين كلمة المرور",
          },
          tx,
        );
      });
      throw err;
    }
}

router.post(
  "/auth/password-reset/complete",
  passwordResetCompleteLimiter,
  async (_req, res) => {
    res.status(410).json({
      error: "استعادة كلمة المرور عبر البريد غير متاحة في هذا الإصدار.",
      code: "EMAIL_PASSWORD_RECOVERY_DISABLED",
    });
  },
);

router.post("/auth/change-password", requireAuth, async (req, res) => {
  const input = parseOrRespond(changeOwnPasswordInputSchema, req.body, res);
  if (!input) return;
  const user = req.currentUser!;
  if (!(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
    res.status(422).json({
      error: "كلمة المرور الحالية غير صحيحة.",
      code: "CURRENT_PASSWORD_INCORRECT",
    });
    return;
  }
  const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);
  await db.transaction(async (tx) => {
    await tx.update(usersTable).set({
      passwordHash,
      mustChangePassword: false,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, user.id));
    await tx.delete(sessionsTable).where(and(
      sql`${sessionsTable.sess} ->> 'userId' = ${user.id}`,
      sql`${sessionsTable.sid} <> ${req.sessionID}`,
    ));
    await writeAudit({
      tenantId: req.currentTenant?.id ?? null,
      userId: user.id,
      action: "USER_CHANGED_OWN_PASSWORD",
      entityType: "user",
      entityId: user.id,
      summary: "غيّر المستخدم كلمة مروره",
    }, tx);
  });
  res.status(204).end();
});

router.post("/auth/forced-password-change", requireAuth, async (req, res) => {
  const input = parseOrRespond(forcedPasswordChangeInputSchema, req.body, res);
  if (!input) return;
  const user = req.currentUser!;
  if (!user.mustChangePassword) {
    res.status(409).json({
      error: "لا يتطلب هذا الحساب تغيير كلمة المرور.",
      code: "PASSWORD_CHANGE_NOT_REQUIRED",
    });
    return;
  }
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  await db.transaction(async (tx) => {
    await tx.update(usersTable).set({
      passwordHash,
      mustChangePassword: false,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, user.id));
    await tx.delete(sessionsTable).where(and(
      sql`${sessionsTable.sess} ->> 'userId' = ${user.id}`,
      sql`${sessionsTable.sid} <> ${req.sessionID}`,
    ));
    await writeAudit({
      tenantId: req.currentTenant?.id ?? null,
      userId: user.id,
      action: "USER_COMPLETED_FORCED_PASSWORD_CHANGE",
      entityType: "user",
      entityId: user.id,
      summary: "أنشأ المستخدم كلمة مرور خاصة بعد إعادة تعيين إدارية",
    }, tx);
  });
  res.status(204).end();
});

router.post("/auth/logout", async (req, res) => {
  const userId = req.session.userId;
  const tenantId = req.session.tenantId;
  if (userId) {
    await writeAudit({
      tenantId: tenantId ?? null,
      userId,
      action: "logout",
      entityType: "user",
      entityId: userId,
      summary: "تسجيل خروج",
    });
  }
  await new Promise<void>((resolve) => req.session.destroy(() => resolve()));
  res.clearCookie("dfs.sid", { path: "/" });
  res.status(204).end();
});

router.get("/auth/me", requireAuth, async (req, res) => {
  const user = req.currentUser!;
  const preferences = await getOrCreatePreferences(user.id);
  res.json({
    user: toPublicUser(
      user,
      req.currentMembership ?? {
        role: "ADMIN",
        canViewFinancials: null,
        canRecordPayments: null,
      },
    ),
    preferences: toPreferencesDto(preferences),
    currentTenant: req.currentTenant
      ? toTenantSummary(req.currentTenant)
      : null,
    memberships: req.tenantMemberships ?? [],
    isPlatformAdmin: req.isPlatformAdmin ?? false,
  });
});

router.post("/auth/tenant", requireAuth, async (req, res) => {
  const input = parseOrRespond(switchTenantInputSchema, req.body, res);
  if (!input) return;

  const context = await loadUserTenantContext(
    req.currentUser!.id,
    input.tenantId,
  );
  if (!context.current || context.current.tenant.id !== input.tenantId) {
    res.status(404).json({
      error: "تعذر العثور على العيادة المطلوبة.",
      code: "TENANT_NOT_FOUND",
    });
    return;
  }

  req.session.tenantId = context.current.tenant.id;
  await new Promise<void>((resolve, reject) =>
    req.session.save((err) => (err ? reject(err) : resolve())),
  );

  const preferences = await getOrCreatePreferences(req.currentUser!.id);
  res.json({
    user: toPublicUser(req.currentUser!, context.current.membership),
    preferences: toPreferencesDto(preferences),
    currentTenant: toTenantSummary(context.current.tenant),
    memberships: context.memberships.map(({ membership, tenant }) => ({
      role: membership.role,
      isActive: membership.isActive,
      canViewFinancialsOverride: membership.canViewFinancials,
      canRecordPaymentsOverride: membership.canRecordPayments,
      tenant: toTenantSummary(tenant),
    })),
    isPlatformAdmin: context.isPlatformAdmin,
  });
});

export default router;

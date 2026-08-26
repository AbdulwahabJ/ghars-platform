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
  completePasswordResetInputSchema,
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
const TRIAL_MS = 72 * 60 * 60 * 1000;

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
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.role, "ADMIN"))
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
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.role, "ADMIN"))
      .limit(1);
    if (existingAdmin) return null;

    const [user] = await tx
      .insert(usersTable)
      .values({
        username,
        email: input.email,
        passwordHash,
        fullName: input.fullName,
        role: "ADMIN",
      })
      .returning();
    if (!user) throw new Error("failed to create admin user");
    const [tenant] = await tx
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.referenceCode, "internal"))
      .limit(1);
    if (!tenant) throw new Error("default tenant is missing");
    await tx.insert(tenantMembershipsTable).values({
      tenantId: tenant.id,
      userId: user.id,
      role: "ADMIN",
    });
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
  // This deliberately occurs before hashing or any database operation.
  if (!isVerificationEmailConfigured()) {
    res.status(503).json({ error: "خدمة البريد الإلكتروني غير مهيأة حاليًا.", code: "EMAIL_NOT_CONFIGURED" });
    return;
  }
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashVerificationToken(rawToken);
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  let created: { tokenId: string; tenantId: string; userId: string };
  try {
    created = await db.transaction(async (tx) => {
      const referenceCode = `clinic-${randomBytes(6).toString("hex")}`;
      const [tenant] = await tx.insert(tenantsTable).values({
        referenceCode, name: input.tenantName, legalName: input.legalName ?? null,
        contactName: input.ownerName, contactEmail: input.email, locale: input.locale,
      }).returning();
      const [user] = await tx.insert(usersTable).values({
        username: input.username, email: input.email, passwordHash,
        fullName: input.ownerName, role: "ADMIN",
      }).returning();
      await tx.insert(tenantOwnerEmailClaimsTable).values({ email: input.email, tenantId: tenant.id, userId: user.id });
      await tx.insert(tenantMembershipsTable).values({ tenantId: tenant.id, userId: user.id, role: "ADMIN" });
      await tx.insert(userPreferencesTable).values({ userId: user.id, locale: input.locale });
      const [token] = await tx.insert(emailVerificationTokensTable).values({
        tenantId: tenant.id, userId: user.id, tokenHash,
        expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
      }).returning();
      await writeAudit({ tenantId: tenant.id, userId: user.id, action: "tenant_registration_created", entityType: "tenant", entityId: tenant.id, summary: "إنشاء عيادة بانتظار تأكيد البريد" }, tx);
      return { tokenId: token.id, tenantId: tenant.id, userId: user.id };
    });
  } catch {
    res.status(409).json({ error: "تعذر إنشاء الحساب بهذه البيانات.", code: "REGISTRATION_CONFLICT" });
    return;
  }
  try {
    await sendVerificationEmail({ to: input.email, fullName: input.ownerName, locale: input.locale, token: rawToken });
  } catch {
    await db.update(emailVerificationTokensTable).set({ usedAt: new Date() }).where(eq(emailVerificationTokensTable.id, created.tokenId));
    res.status(503).json({ error: "تعذر إرسال رسالة التحقق. يرجى المحاولة لاحقًا.", code: "EMAIL_DELIVERY_FAILED" });
    return;
  }
  res.status(201).json({ message: "تم إنشاء الحساب. يرجى التحقق من البريد الإلكتروني." });
});

router.post("/auth/verify-email", verificationLimiter, async (req, res) => {
  const input = parseOrRespond(emailVerificationInputSchema, req.body, res);
  if (!input) return;
  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const [token] = await tx.select().from(emailVerificationTokensTable).where(and(
      eq(emailVerificationTokensTable.tokenHash, hashVerificationToken(input.token)),
      isNull(emailVerificationTokensTable.usedAt), gt(emailVerificationTokensTable.expiresAt, now),
    )).limit(1);
    if (!token) return null;
    const [consumed] = await tx.update(emailVerificationTokensTable).set({ usedAt: now }).where(and(
      eq(emailVerificationTokensTable.id, token.id), isNull(emailVerificationTokensTable.usedAt),
    )).returning({ id: emailVerificationTokensTable.id });
    if (!consumed) return null;
    const [tenant] = await tx.select().from(tenantsTable).where(eq(tenantsTable.id, token.tenantId)).limit(1);
    if (!tenant || tenant.status !== "PENDING_VERIFICATION") return null;
    const ends = new Date(now.getTime() + TRIAL_MS);
    const [updated] = await tx.update(tenantsTable).set({
      status: "TRIAL", trialStartedAt: now, trialEndsAt: ends, updatedAt: now,
    }).where(and(eq(tenantsTable.id, tenant.id), eq(tenantsTable.status, "PENDING_VERIFICATION"))).returning();
    if (!updated) return null;
    await writeAudit({ tenantId: tenant.id, userId: token.userId, action: "tenant_email_verified", entityType: "tenant", entityId: tenant.id, summary: "تم تأكيد البريد وبدء الفترة التجريبية" }, tx);
    return ends;
  });
  if (!result) { res.status(422).json({ error: "رابط التحقق غير صالح أو منتهي الصلاحية.", code: "VERIFICATION_TOKEN_INVALID" }); return; }
  res.json({ verified: true, trialEndsAt: result.toISOString() });
});

router.post("/auth/resend-verification", resendVerificationLimiter, async (req, res) => {
  const input = parseOrRespond(resendVerificationInputSchema, req.body, res);
  if (!input) return;
  const generic = { message: "إذا كان الحساب بانتظار التحقق، فسيصل رابط جديد خلال دقائق." };
  if (!isVerificationEmailConfigured()) { res.status(503).json({ error: "خدمة البريد الإلكتروني غير مهيأة حاليًا.", code: "EMAIL_NOT_CONFIGURED" }); return; }
  const [claim] = await db.select().from(tenantOwnerEmailClaimsTable).where(eq(tenantOwnerEmailClaimsTable.email, input.email)).limit(1);
  if (!claim) { res.json(generic); return; }
  const [tenant] = await db.select().from(tenantsTable).where(and(eq(tenantsTable.id, claim.tenantId), eq(tenantsTable.status, "PENDING_VERIFICATION"))).limit(1);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, claim.userId)).limit(1);
  if (!tenant || !user?.email) { res.json(generic); return; }
  const rawToken = randomBytes(32).toString("base64url");
  const [newToken] = await db.transaction(async (tx) => {
    await tx.delete(emailVerificationTokensTable).where(and(eq(emailVerificationTokensTable.tenantId, tenant.id), eq(emailVerificationTokensTable.userId, user.id), isNull(emailVerificationTokensTable.usedAt)));
    return tx.insert(emailVerificationTokensTable).values({ tenantId: tenant.id, userId: user.id, tokenHash: hashVerificationToken(rawToken), expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS) }).returning();
  });
  try { await sendVerificationEmail({ to: user.email, fullName: user.fullName, locale: tenant.locale === "en" ? "en" : "ar", token: rawToken }); }
  catch { await db.update(emailVerificationTokensTable).set({ usedAt: new Date() }).where(eq(emailVerificationTokensTable.id, newToken.id)); }
  res.json(generic);
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

    // The same non-account-specific failure is returned before any account
    // lookup, so a missing provider cannot become an account-enumeration oracle.
    if (!isPasswordResetEmailConfigured()) {
      res.status(503).json({
        error:
          "خدمة البريد الإلكتروني غير مهيأة حاليًا. يرجى التواصل مع مدير النظام.",
        code: "EMAIL_NOT_CONFIGURED",
      });
      return;
    }

    // Return before account-specific work begins. This keeps a matching,
    // unknown, or legacy no-email identifier indistinguishable by latency.
    res.json({ message: PASSWORD_RESET_GENERIC_MESSAGE });
    void issuePasswordReset(input.identifier).catch((err) => {
      req.log?.error({ err }, "password reset request failed");
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
  async (req, res) => {
    const input = parseOrRespond(completePasswordResetInputSchema, req.body, res);
    if (!input) return;

    const now = new Date();
    const tokenHash = hashPasswordResetToken(input.token);
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const didReset = await db.transaction(async (tx) => {
      const [token] = await tx
        .select()
        .from(passwordResetTokensTable)
        .where(
          and(
            eq(passwordResetTokensTable.tokenHash, tokenHash),
            isNull(passwordResetTokensTable.usedAt),
            gt(passwordResetTokensTable.expiresAt, now),
          ),
        )
        .limit(1);
      if (!token) return false;

      const [user] = await tx
        .select({ id: usersTable.id, isActive: usersTable.isActive })
        .from(usersTable)
        .where(eq(usersTable.id, token.userId))
        .limit(1);
      if (!user?.isActive) return false;

      // The conditional update makes concurrent attempts race safely: exactly
      // one request can consume a token and change the password.
      const [consumed] = await tx
        .update(passwordResetTokensTable)
        .set({ usedAt: now })
        .where(
          and(
            eq(passwordResetTokensTable.id, token.id),
            isNull(passwordResetTokensTable.usedAt),
            gt(passwordResetTokensTable.expiresAt, now),
          ),
        )
        .returning({ id: passwordResetTokensTable.id });
      if (!consumed) return false;

      await tx
        .update(usersTable)
        .set({ passwordHash, updatedAt: now })
        .where(eq(usersTable.id, user.id));
      await tx
        .delete(sessionsTable)
        .where(sql`${sessionsTable.sess} ->> 'userId' = ${user.id}`);
      await writeAudit(
        {
          tenantId: null,
          userId: user.id,
          action: "password_reset_completed",
          entityType: "user",
          entityId: user.id,
          summary: "إعادة تعيين كلمة المرور عبر رابط الاستعادة",
        },
        tx,
      );
      return true;
    });

    if (!didReset) {
      res.status(422).json({
        error: "رابط إعادة التعيين غير صالح أو منتهي الصلاحية.",
        code: "RESET_TOKEN_INVALID",
      });
      return;
    }

    res.status(204).end();
  },
);

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

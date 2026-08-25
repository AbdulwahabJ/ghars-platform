import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import {
  auditLogsTable,
  db,
  sessionsTable,
  usersTable,
  type User,
} from "@workspace/db";
import {
  createUserInputSchema,
  resetPasswordInputSchema,
  updateUserInputSchema,
  type AdminUser,
  type AdminUsersResponse,
} from "@workspace/shared";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { writeAudit } from "../lib/audit";
import { effectivePermissions } from "../lib/permissions";
import { parseOrRespond } from "../lib/validation";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

router.use("/admin", requireAuth, requireRole("ADMIN"));

const BCRYPT_ROUNDS = 12;

const USER_NOT_FOUND = {
  error: "المستخدم غير موجود.",
  code: "USER_NOT_FOUND",
};

function toAdminUser(user: User): AdminUser {
  const perms = effectivePermissions(user);
  return {
    id: user.id,
    username: user.username,
    email: user.email ?? null,
    fullName: user.fullName,
    role: user.role,
    isActive: user.isActive,
    canViewFinancialsOverride: user.canViewFinancials,
    canRecordPaymentsOverride: user.canRecordPayments,
    canViewFinancials: perms.canViewFinancials,
    canRecordPayments: perms.canRecordPayments,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    avatarData: user.avatarData ?? null,
  };
}

async function findUser(id: string): Promise<User | undefined> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);
  return user;
}

/** Delete every stored session belonging to a user (forced logout). */
async function invalidateUserSessions(userId: string): Promise<void> {
  await db
    .delete(sessionsTable)
    .where(sql`${sessionsTable.sess} ->> 'userId' = ${userId}`);
}

async function countOtherActiveAdmins(excludedId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.role, "ADMIN"),
        eq(usersTable.isActive, true),
        ne(usersTable.id, excludedId),
      ),
    );
  return row?.count ?? 0;
}

function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  while (current instanceof Error) {
    if ((current as { code?: string }).code === "23505") return true;
    current = current.cause;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* List                                                                */
/* ------------------------------------------------------------------ */

router.get("/admin/users", async (_req, res) => {
  const users = await db
    .select()
    .from(usersTable)
    .orderBy(asc(usersTable.createdAt));
  const body: AdminUsersResponse = { users: users.map(toAdminUser) };
  res.json(body);
});

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

router.post("/admin/users", async (req, res) => {
  const input = parseOrRespond(createUserInputSchema, req.body, res);
  if (!input) return;

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  try {
    const created = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(usersTable)
        .values({
          username: input.username,
          email: input.email,
          passwordHash,
          fullName: input.fullName,
          role: input.role,
          canViewFinancials: input.canViewFinancials ?? null,
          canRecordPayments: input.canRecordPayments ?? null,
          avatarData: input.avatarData ?? null,
        })
        .returning();
      await writeAudit(
        {
          userId: req.currentUser!.id,
          action: "user_create",
          entityType: "user",
          entityId: user.id,
          summary: `إنشاء مستخدم جديد: ${user.fullName} (${user.username})`,
          details: { role: user.role },
        },
        tx,
      );
      return user;
    });
    res.status(201).json({ user: toAdminUser(created) });
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({
          error: "اسم المستخدم أو البريد الإلكتروني مستخدم بالفعل.",
          code: "USER_IDENTIFIER_TAKEN",
      });
      return;
    }
    throw err;
  }
});

/* ------------------------------------------------------------------ */
/* Update (name / role / permission overrides)                         */
/* ------------------------------------------------------------------ */

router.patch("/admin/users/:id", async (req, res) => {
  const input = parseOrRespond(updateUserInputSchema, req.body, res);
  if (!input) return;

  const target = await findUser(req.params.id);
  if (!target) {
    res.status(404).json(USER_NOT_FOUND);
    return;
  }

  const actor = req.currentUser!;
  if (
    input.role &&
    input.role !== "ADMIN" &&
    target.role === "ADMIN" &&
    target.id === actor.id
  ) {
    res.status(422).json({
      error: "لا يمكنك تغيير دورك الإداري بنفسك.",
      code: "SELF_DEMOTION_BLOCKED",
    });
    return;
  }
  if (
    input.role &&
    input.role !== "ADMIN" &&
    target.role === "ADMIN" &&
    target.isActive &&
    (await countOtherActiveAdmins(target.id)) === 0
  ) {
    res.status(422).json({
      error: "لا يمكن تغيير دور آخر مدير نشط في النظام.",
      code: "LAST_ADMIN_BLOCKED",
    });
    return;
  }
  if (input.email === null && target.email !== null) {
    res.status(422).json({
      error: "لا يمكن إزالة البريد الإلكتروني من حساب تم إنشاؤه ببريد للاستعادة.",
      code: "EMAIL_REQUIRED",
    });
    return;
  }

  const changes: string[] = [];
  if (input.fullName && input.fullName !== target.fullName) {
    changes.push("الاسم الكامل");
  }
  if (input.email !== undefined && input.email !== target.email) {
    changes.push("البريد الإلكتروني");
  }
  if (input.role && input.role !== target.role) changes.push("الدور");
  if (
    input.canViewFinancials !== undefined &&
    input.canViewFinancials !== target.canViewFinancials
  ) {
    changes.push("صلاحية عرض المبالغ المالية");
  }
  if (
    input.canRecordPayments !== undefined &&
    input.canRecordPayments !== target.canRecordPayments
  ) {
    changes.push("صلاحية تسجيل الدفعات");
  }
  // Track avatar changes for audit — never store the image data itself.
  if (input.avatarData !== undefined) {
    const hadAvatar = !!target.avatarData;
    const hasAvatar = !!input.avatarData;
    if (!hadAvatar && hasAvatar) changes.push("إضافة صورة الملف الشخصي");
    else if (hadAvatar && !hasAvatar) changes.push("إزالة صورة الملف الشخصي");
    else if (hadAvatar && hasAvatar) changes.push("تغيير صورة الملف الشخصي");
  }

  const updated = await db.transaction(async (tx) => {
    const [user] = await tx
      .update(usersTable)
      .set({
        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.canViewFinancials !== undefined
          ? { canViewFinancials: input.canViewFinancials }
          : {}),
        ...(input.canRecordPayments !== undefined
          ? { canRecordPayments: input.canRecordPayments }
          : {}),
        // undefined = untouched; null = remove; string = new photo
        ...(input.avatarData !== undefined
          ? { avatarData: input.avatarData }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, target.id))
      .returning();
    await writeAudit(
      {
        userId: actor.id,
        action: "user_update",
        entityType: "user",
        entityId: target.id,
        summary: `تعديل بيانات المستخدم ${target.fullName}${
          changes.length > 0 ? `: ${changes.join("، ")}` : ""
        }`,
        details: {
          role: input.role,
          emailChanged: input.email !== undefined,
          canViewFinancials: input.canViewFinancials,
          canRecordPayments: input.canRecordPayments,
          // Never log image contents.
        },
      },
      tx,
    );
    return user;
  });

  res.json({ user: toAdminUser(updated) });
});

/* ------------------------------------------------------------------ */
/* Activate / deactivate                                               */
/* ------------------------------------------------------------------ */

router.post("/admin/users/:id/deactivate", async (req, res) => {
  const target = await findUser(req.params.id);
  if (!target) {
    res.status(404).json(USER_NOT_FOUND);
    return;
  }
  const actor = req.currentUser!;
  if (target.id === actor.id) {
    res.status(422).json({
      error: "لا يمكنك إيقاف حسابك بنفسك.",
      code: "SELF_DEACTIVATION_BLOCKED",
    });
    return;
  }
  if (
    target.role === "ADMIN" &&
    target.isActive &&
    (await countOtherActiveAdmins(target.id)) === 0
  ) {
    res.status(422).json({
      error: "لا يمكن إيقاف آخر مدير نشط في النظام.",
      code: "LAST_ADMIN_BLOCKED",
    });
    return;
  }

  const updated = await db.transaction(async (tx) => {
    const [user] = await tx
      .update(usersTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(usersTable.id, target.id))
      .returning();
    await writeAudit(
      {
        userId: actor.id,
        action: "user_deactivate",
        entityType: "user",
        entityId: target.id,
        summary: `إيقاف المستخدم ${target.fullName} (${target.username})`,
      },
      tx,
    );
    return user;
  });
  // Force logout everywhere: historical records keep referencing the user.
  await invalidateUserSessions(target.id);

  res.json({ user: toAdminUser(updated) });
});

router.post("/admin/users/:id/activate", async (req, res) => {
  const target = await findUser(req.params.id);
  if (!target) {
    res.status(404).json(USER_NOT_FOUND);
    return;
  }
  const updated = await db.transaction(async (tx) => {
    const [user] = await tx
      .update(usersTable)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(usersTable.id, target.id))
      .returning();
    await writeAudit(
      {
        userId: req.currentUser!.id,
        action: "user_activate",
        entityType: "user",
        entityId: target.id,
        summary: `تفعيل المستخدم ${target.fullName} (${target.username})`,
      },
      tx,
    );
    return user;
  });
  res.json({ user: toAdminUser(updated) });
});

/* ------------------------------------------------------------------ */
/* Password reset                                                      */
/* ------------------------------------------------------------------ */

router.post("/admin/users/:id/reset-password", async (req, res) => {
  const input = parseOrRespond(resetPasswordInputSchema, req.body, res);
  if (!input) return;

  const target = await findUser(req.params.id);
  if (!target) {
    res.status(404).json(USER_NOT_FOUND);
    return;
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  await db.transaction(async (tx) => {
    await tx
      .update(usersTable)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(usersTable.id, target.id));
    // Never store the password (or its hash) in the audit log.
    await writeAudit(
      {
        userId: req.currentUser!.id,
        action: "user_password_reset",
        entityType: "user",
        entityId: target.id,
        summary: `إعادة تعيين كلمة مرور المستخدم ${target.fullName}`,
      },
      tx,
    );
  });
  // Any open sessions of the target user must re-authenticate,
  // except when an admin resets their own password (keep current session).
  if (target.id !== req.currentUser!.id) {
    await invalidateUserSessions(target.id);
  }

  res.status(204).end();
});

/* ------------------------------------------------------------------ */
/* Per-user audit history                                              */
/* ------------------------------------------------------------------ */

router.get("/admin/users/:id/audit", async (req, res) => {
  const target = await findUser(req.params.id);
  if (!target) {
    res.status(404).json(USER_NOT_FOUND);
    return;
  }
  const entries = await db
    .select({
      id: auditLogsTable.id,
      action: auditLogsTable.action,
      entityType: auditLogsTable.entityType,
      entityId: auditLogsTable.entityId,
      summary: auditLogsTable.summary,
      createdAt: auditLogsTable.createdAt,
    })
    .from(auditLogsTable)
    .where(eq(auditLogsTable.userId, target.id))
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(50);

  res.json({
    entries: entries.map((e) => ({
      id: e.id,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      summary: e.summary,
      createdAt: e.createdAt.toISOString(),
    })),
  });
});

export default router;

import type { NextFunction, Request, Response } from "express";
import { db, usersTable, type User } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { UserRole } from "@workspace/shared";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Loaded fresh from the database on every authenticated request. */
      currentUser?: User;
    }
  }
}

const UNAUTHENTICATED = {
  error: "يجب تسجيل الدخول للمتابعة.",
  code: "UNAUTHENTICATED",
};

/** Authorization is enforced here on the backend, never only in the UI. */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json(UNAUTHENTICATED);
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user || !user.isActive) {
    req.session.destroy(() => {
      res.status(401).json(UNAUTHENTICATED);
    });
    return;
  }

  req.currentUser = user;
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.currentUser;
    if (!user || !roles.includes(user.role)) {
      res.status(403).json({
        error: "ليست لديك صلاحية لتنفيذ هذا الإجراء.",
        code: "FORBIDDEN",
      });
      return;
    }
    next();
  };
}

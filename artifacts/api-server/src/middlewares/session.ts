import connectPgSimple from "connect-pg-simple";
import session from "express-session";
import { pool } from "@workspace/db";

const PgStore = connectPgSimple(session);

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error("SESSION_SECRET environment variable is required.");
}

const isProduction = process.env.NODE_ENV === "production";
const testMaxAge = process.env.NODE_ENV === "test" ? process.env.TEST_SESSION_MAX_AGE_MS : undefined;
if (testMaxAge !== undefined && (!Number.isSafeInteger(Number(testMaxAge)) || Number(testMaxAge) <= 0)) {
  throw new Error("TEST_SESSION_MAX_AGE_MS must be a positive integer.");
}

/**
 * Server-side sessions stored in PostgreSQL (Drizzle-managed `sessions`
 * table). Cookies are HTTP-only, SameSite=Lax (primary CSRF defense),
 * Secure in production, 12-hour rolling expiration.
 */
export const sessionMiddleware = session({
  store: new PgStore({
    pool,
    tableName: "sessions",
    createTableIfMissing: false,
  }),
  name: "dfs.sid",
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: testMaxAge === undefined ? 12 * 60 * 60 * 1000 : Number(testMaxAge),
    path: "/",
  },
});

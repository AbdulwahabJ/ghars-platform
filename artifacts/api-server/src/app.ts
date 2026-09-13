import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { csrfProtection } from "./middlewares/csrf";
import { sessionMiddleware } from "./middlewares/session";
import { recordSystemError } from "./lib/system-errors";

const app: Express = express();

// Behind the platform proxy: needed for secure cookies and correct
// client IP resolution (rate limiting).
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// 5 MB budget: the Admin legacy-data import sends CSV file content and the
// clinic-logo setting sends a small base64 data URL in JSON bodies.
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);
app.use(csrfProtection);

app.use("/api", router);

app.use(async (err: Error, req: Request, res: Response, next: NextFunction) => {
  req.log?.error({ err }, "unhandled error");
  if (res.headersSent) {
    next(err);
    return;
  }
  const referenceCode = await recordSystemError(req, err);
  res.status(500).json({
    error: "حدث خطأ غير متوقع في الخادم. يرجى المحاولة مرة أخرى.",
    code: "INTERNAL",
    referenceCode,
  });
});

export default app;

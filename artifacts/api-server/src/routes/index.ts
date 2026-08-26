import { Router, type IRouter } from "express";
import adminAuditRouter from "./admin-audit";
import adminExportRouter from "./admin-export";
import adminImportRouter from "./admin-import";
import adminLookupsRouter from "./admin-lookups";
import adminTemplatesRouter from "./admin-templates";
import adminUsersRouter from "./admin-users";
import authRouter from "./auth";
import commercialRouter from "./commercial";
import platformAdminRouter from "./platform-admin";
import boneGraftProceduresRouter from "./bone-graft-procedures";
import financeRouter from "./finance";
import followupsRouter from "./followups";
import healthRouter from "./health";
import implantCasesRouter from "./implant-cases";
import quickEntryRouter from "./quick-entry";
import patientsRouter from "./patients";
import preferencesRouter from "./preferences";
import reportsRouter from "./reports";
import settingsRouter from "./settings";
import {
  requireAuth,
  requireOperationalTenant,
  requirePlatformAdmin,
} from "../middlewares/auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
// These authenticated lifecycle surfaces must remain reachable for suspended,
// expired-trial, and pending-verification customers.
router.use(requireAuth, commercialRouter);
router.use("/platform-admin", requireAuth, requirePlatformAdmin);
router.use(platformAdminRouter);
router.use(preferencesRouter);
router.use(requireAuth, requireOperationalTenant);
router.use(patientsRouter);
router.use(implantCasesRouter);
router.use(boneGraftProceduresRouter);
router.use(financeRouter);
router.use(followupsRouter);
router.use(reportsRouter);
router.use(quickEntryRouter);
router.use(settingsRouter);
router.use(adminUsersRouter);
router.use(adminLookupsRouter);
router.use(adminTemplatesRouter);
router.use(adminAuditRouter);
router.use(adminImportRouter);
router.use(adminExportRouter);

export default router;

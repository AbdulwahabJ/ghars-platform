import { Router, type IRouter } from "express";
import adminAuditRouter from "./admin-audit";
import adminExportRouter from "./admin-export";
import adminImportRouter from "./admin-import";
import adminLookupsRouter from "./admin-lookups";
import adminTemplatesRouter from "./admin-templates";
import adminUsersRouter from "./admin-users";
import authRouter from "./auth";
import financeRouter from "./finance";
import followupsRouter from "./followups";
import healthRouter from "./health";
import implantCasesRouter from "./implant-cases";
import patientsRouter from "./patients";
import preferencesRouter from "./preferences";
import reportsRouter from "./reports";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(preferencesRouter);
router.use(patientsRouter);
router.use(implantCasesRouter);
router.use(financeRouter);
router.use(followupsRouter);
router.use(reportsRouter);
router.use(settingsRouter);
router.use(adminUsersRouter);
router.use(adminLookupsRouter);
router.use(adminTemplatesRouter);
router.use(adminAuditRouter);
router.use(adminImportRouter);
router.use(adminExportRouter);

export default router;

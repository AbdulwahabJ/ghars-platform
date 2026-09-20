import { Router, type IRouter } from "express";
import adminAuditRouter from "./admin-audit";
import adminExportRouter from "./admin-export";
import permanentDeleteRouter from "./permanent-delete";
import adminImportRouter from "./admin-import";
import universalImportRouter from "./universal-import";
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
import patientRecordExportRouter from "./patient-record-export";
import preferencesRouter from "./preferences";
import reportsRouter from "./reports";
import settingsRouter from "./settings";
import landingMediaRouter from "./landing-media";
import featuresRouter from "./features";
import {
  requireAuth,
  requireOperationalTenant,
  requirePlatformAdmin,
} from "../middlewares/auth";
import { requireLegacyImportEnabled } from "../middlewares/legacy-import";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
// Public landing-page media read/proxy must remain outside the admin mount.
router.use(landingMediaRouter);
// These authenticated lifecycle surfaces must remain reachable for suspended,
// expired-trial, and pending-verification customers.
router.use(commercialRouter);
router.use("/features", requireAuth);
router.use(featuresRouter);
router.use("/platform-admin", requireAuth, requirePlatformAdmin);
router.use(platformAdminRouter);
router.use(preferencesRouter);
router.use(requireAuth, requireOperationalTenant);
// Every tenant-facing importer route is under /admin/import, including the
// universal importer. Keep the platform-admin settings API outside this gate.
router.use("/admin/import", requireLegacyImportEnabled);
router.use(patientsRouter);
router.use(patientRecordExportRouter);
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
router.use(universalImportRouter);
router.use(adminExportRouter);
router.use(permanentDeleteRouter);

export default router;

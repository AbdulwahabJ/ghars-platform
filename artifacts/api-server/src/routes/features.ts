import { Router, type IRouter } from "express";
import { loadPlatformSettings } from "../lib/platform-settings";

const router: IRouter = Router();

router.get("/features", async (_req, res) => {
  const settings = await loadPlatformSettings();
  res.json({ legacyImportEnabled: settings.legacyImportEnabled });
});

export default router;
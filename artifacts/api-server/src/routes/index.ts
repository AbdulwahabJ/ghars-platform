import { Router, type IRouter } from "express";
import authRouter from "./auth";
import healthRouter from "./health";
import patientsRouter from "./patients";
import preferencesRouter from "./preferences";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(preferencesRouter);
router.use(patientsRouter);

export default router;

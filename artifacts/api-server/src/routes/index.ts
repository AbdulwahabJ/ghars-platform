import { Router, type IRouter } from "express";
import authRouter from "./auth";
import financeRouter from "./finance";
import healthRouter from "./health";
import implantCasesRouter from "./implant-cases";
import patientsRouter from "./patients";
import preferencesRouter from "./preferences";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(preferencesRouter);
router.use(patientsRouter);
router.use(implantCasesRouter);
router.use(financeRouter);

export default router;

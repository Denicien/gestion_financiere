import { Router } from 'express';
import authRoutes from './auth.routes.js';
import utilisateursRoutes from './utilisateurs.routes.js';
import tiersRoutes from './tiers.routes.js';
import comptesRoutes from './comptes.routes.js';
import categoriesRoutes from './categories.routes.js';
import facturesRoutes from './factures.routes.js';
import operationsRoutes from './operations.routes.js';
import dashboardRoutes from './dashboard.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/utilisateurs', utilisateursRoutes);
router.use('/tiers', tiersRoutes);
router.use('/comptes', comptesRoutes);
router.use('/categories', categoriesRoutes);
router.use('/factures', facturesRoutes);
router.use('/operations', operationsRoutes);
router.use('/dashboard', dashboardRoutes);

export default router;
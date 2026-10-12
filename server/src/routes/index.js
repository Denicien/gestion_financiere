import { Router } from 'express';
import authRoutes from './auth.routes.js';
import utilisateursRoutes from './utilisateurs.routes.js';
import tiersRoutes from './tiers.routes.js';
import comptesRoutes from './comptes.routes.js';
import categoriesRoutes from './categories.routes.js';
import facturesRoutes from './factures.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/utilisateurs', utilisateursRoutes);
router.use('/tiers', tiersRoutes);
router.use('/comptes', comptesRoutes);
router.use('/categories', categoriesRoutes);
router.use('/factures', facturesRoutes);

export default router;

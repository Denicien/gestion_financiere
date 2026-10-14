import { Router } from 'express';
import { consulter } from '../controllers/dashboard.controller.js';
import { authentifier } from '../middlewares/auth.middleware.js';

const router = Router();

// Les trois rôles consultent le tableau de bord (tableau 10)
router.get('/', authentifier, consulter);

export default router;
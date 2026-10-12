import { Router } from 'express';
import { inscription, connexion, moi } from '../controllers/auth.controller.js';
import { authentifier } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/inscription', inscription);
router.post('/connexion', connexion);
router.get('/moi', authentifier, moi);

export default router;

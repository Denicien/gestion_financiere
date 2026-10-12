import { Router } from 'express';
import {
  lister, obtenir, creer, modifier, supprimer,
} from '../controllers/tiers.controller.js';
import { authentifier } from '../middlewares/auth.middleware.js';
import { autoriser } from '../middlewares/role.middleware.js';
import { ROLES } from '../utils/roles.js';

const router = Router();
const ecriture = autoriser(ROLES.ADMIN, ROLES.COMPTABLE); // le gérant est en lecture seule

router.use(authentifier);
router.get('/', lister);
router.get('/:id', obtenir);
router.post('/', ecriture, creer);
router.put('/:id', ecriture, modifier);
router.delete('/:id', ecriture, supprimer);

export default router;

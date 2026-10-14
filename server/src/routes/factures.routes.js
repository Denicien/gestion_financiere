import { Router } from 'express';
import {
  lister, obtenir, creer, modifier, annuler,
} from '../controllers/factures.controller.js';
import { authentifier } from '../middlewares/auth.middleware.js';
import { autoriser } from '../middlewares/role.middleware.js';
import { ROLES } from '../utils/roles.js';

const router = Router();
const ecriture = autoriser(ROLES.ADMIN, ROLES.COMPTABLE);

router.use(authentifier);
router.get('/', lister);
router.get('/:id', obtenir);
router.post('/', ecriture, creer);
router.put('/:id', ecriture, modifier);
router.patch('/:id/annuler', ecriture, annuler);

export default router;
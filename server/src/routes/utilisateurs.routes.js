import { Router } from 'express';
import {
  creer, lister, changerRole, changerStatut, reinitialiserMotDePasse,
} from '../controllers/utilisateurs.controller.js';
import { authentifier } from '../middlewares/auth.middleware.js';
import { autoriser } from '../middlewares/role.middleware.js';
import { ROLES } from '../utils/roles.js';

const router = Router();

// Seul l'administrateur gère les utilisateurs (RG4)
router.use(authentifier, autoriser(ROLES.ADMIN));
router.post('/', creer);
router.get('/', lister);
router.patch('/:id/role', changerRole);
router.patch('/:id/statut', changerStatut);
router.patch('/:id/mot-de-passe', reinitialiserMotDePasse);

export default router;

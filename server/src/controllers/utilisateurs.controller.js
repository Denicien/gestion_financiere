import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import { ROLES_LISTE } from '../utils/roles.js';
import {
  texteRequis, texteOptionnel, emailValide, motDePasseValide,
} from '../utils/validation.js';
import { creerUtilisateur, listerUtilisateurs } from '../services/utilisateur.service.js';

export const creer = asyncHandler(async (req, res) => {
  const b = req.body ?? {};
  if (!ROLES_LISTE.includes(b.role)) {
    throw new HttpError(400, `Rôle invalide. Valeurs acceptées : ${ROLES_LISTE.join(', ')}.`);
  }
  const data = {
    nom_utilisateur: texteRequis(b.nom_utilisateur, 'nom', 60),
    prenom_utilisateur: texteOptionnel(b.prenom_utilisateur, 'prénom', 60),
    email: emailValide(b.email_utilisateur),
    mot_de_passe: motDePasseValide(b.mot_de_passe),
    role: b.role,
  };
  // L'entreprise vient de l'utilisateur authentifié, jamais du corps de la requête (RG6)
  const utilisateur = await creerUtilisateur(req.user.id_entreprise, data);
  res.status(201).json(utilisateur);
});

export const lister = asyncHandler(async (req, res) => {
  res.json(await listerUtilisateurs(req.user.id_entreprise));
});

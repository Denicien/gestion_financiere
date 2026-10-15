import { asyncHandler } from '../utils/asyncHandler.js';
import { ROLES_LISTE } from '../utils/roles.js';
import {
  texteRequis, texteOptionnel, emailValide, motDePasseValide, choixParmi, identifiant,
} from '../utils/validation.js';
import {
  creerUtilisateur, listerUtilisateurs, changerRole as changerRoleService,
  changerStatut as changerStatutService, reinitialiserMotDePasse as reinitialiserService,
} from '../services/utilisateur.service.js';

export const creer = asyncHandler(async (req, res) => {
  const b = req.body ?? {};
  const data = {
    nom_utilisateur: texteRequis(b.nom_utilisateur, 'nom', 60),
    prenom_utilisateur: texteOptionnel(b.prenom_utilisateur, 'prénom', 60),
    email: emailValide(b.email_utilisateur),
    mot_de_passe: motDePasseValide(b.mot_de_passe),
    role: choixParmi(b.role, 'rôle', ROLES_LISTE),
  };
  // L'entreprise vient de l'utilisateur authentifié, jamais du corps de la requête (RG6)
  res.status(201).json(await creerUtilisateur(req.user.id_entreprise, data));
});

export const lister = asyncHandler(async (req, res) => {
  res.json(await listerUtilisateurs(req.user.id_entreprise));
});

export const changerRole = asyncHandler(async (req, res) => {
  const role = choixParmi(req.body?.role, 'rôle', ROLES_LISTE);
  res.json(
    await changerRoleService(
      req.user.id_entreprise, req.user.id_utilisateur, identifiant(req.params.id), role
    )
  );
});

export const changerStatut = asyncHandler(async (req, res) => {
  const statut = choixParmi(req.body?.statut_utilisateur, 'statut', ['actif', 'desactive']);
  res.json(
    await changerStatutService(
      req.user.id_entreprise, req.user.id_utilisateur, identifiant(req.params.id), statut
    )
  );
});

export const reinitialiserMotDePasse = asyncHandler(async (req, res) => {
  const motDePasse = motDePasseValide(req.body?.mot_de_passe);
  await reinitialiserService(req.user.id_entreprise, identifiant(req.params.id), motDePasse);
  res.status(204).end();
});
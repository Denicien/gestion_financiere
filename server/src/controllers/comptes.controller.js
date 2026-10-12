import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import {
  texteRequis, texteOptionnel, choixParmi, identifiant, montant,
} from '../utils/validation.js';
import {
  listerComptes, obtenirCompte, creerCompte, modifierCompte,
  changerStatutCompte, supprimerCompte,
} from '../services/compte.service.js';

const TYPES = ['banque', 'caisse', 'mobile_money'];
const STATUTS = ['actif', 'cloture'];

function lireCompte(b = {}) {
  return {
    nom_compte: texteRequis(b.nom_compte, 'nom du compte', 80),
    type_compte: choixParmi(b.type_compte, 'type de compte', TYPES),
    numero_compte: texteOptionnel(b.numero_compte, 'numéro de compte', 40),
    solde_initial: montant(b.solde_initial, 'solde initial', { defaut: '0' }),
  };
}

export const lister = asyncHandler(async (req, res) => {
  const { statut } = req.query;
  if (statut !== undefined && !STATUTS.includes(statut)) {
    throw new HttpError(400, `Le filtre « statut » doit valoir : ${STATUTS.join(', ')}.`);
  }
  res.json(await listerComptes(req.user.id_entreprise, statut));
});

export const obtenir = asyncHandler(async (req, res) => {
  res.json(await obtenirCompte(identifiant(req.params.id), req.user.id_entreprise));
});

export const creer = asyncHandler(async (req, res) => {
  res.status(201).json(await creerCompte(req.user.id_entreprise, lireCompte(req.body)));
});

export const modifier = asyncHandler(async (req, res) => {
  res.json(
    await modifierCompte(identifiant(req.params.id), req.user.id_entreprise, lireCompte(req.body))
  );
});

export const changerStatut = asyncHandler(async (req, res) => {
  const statut = choixParmi(req.body?.statut_compte, 'statut', STATUTS);
  res.json(await changerStatutCompte(identifiant(req.params.id), req.user.id_entreprise, statut));
});

export const supprimer = asyncHandler(async (req, res) => {
  await supprimerCompte(identifiant(req.params.id), req.user.id_entreprise);
  res.status(204).end();
});

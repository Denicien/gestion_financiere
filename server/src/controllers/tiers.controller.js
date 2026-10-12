import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import {
  texteRequis, texteOptionnel, emailOptionnel, choixParmi, identifiant,
} from '../utils/validation.js';
import {
  listerTiers, obtenirTiers, creerTiers, modifierTiers, supprimerTiers,
} from '../services/tiers.service.js';

const TYPES = ['client', 'fournisseur', 'les_deux'];

function lireTiers(b = {}) {
  return {
    nom_tiers: texteRequis(b.nom_tiers, 'nom', 100),
    type_tiers: choixParmi(b.type_tiers, 'type', TYPES),
    nif_tiers: texteOptionnel(b.nif_tiers, 'NIF', 20),
    adresse_tiers: texteOptionnel(b.adresse_tiers, 'adresse', 150),
    telephone_tiers: texteOptionnel(b.telephone_tiers, 'téléphone', 20),
    email_tiers: emailOptionnel(b.email_tiers),
  };
}

export const lister = asyncHandler(async (req, res) => {
  const { type, q } = req.query;
  if (type !== undefined && !['client', 'fournisseur'].includes(type)) {
    throw new HttpError(400, "Le filtre « type » doit valoir 'client' ou 'fournisseur'.");
  }
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const recherche = typeof q === 'string' && q.trim() ? q.trim().slice(0, 100) : null;

  res.json(await listerTiers(req.user.id_entreprise, { type, q: recherche, page, limit }));
});

export const obtenir = asyncHandler(async (req, res) => {
  res.json(await obtenirTiers(identifiant(req.params.id), req.user.id_entreprise));
});

export const creer = asyncHandler(async (req, res) => {
  res.status(201).json(await creerTiers(req.user.id_entreprise, lireTiers(req.body)));
});

export const modifier = asyncHandler(async (req, res) => {
  res.json(
    await modifierTiers(identifiant(req.params.id), req.user.id_entreprise, lireTiers(req.body))
  );
});

export const supprimer = asyncHandler(async (req, res) => {
  await supprimerTiers(identifiant(req.params.id), req.user.id_entreprise);
  res.status(204).end();
});

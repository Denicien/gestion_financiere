import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import {
  texteRequis, choixParmi, identifiant, montant, dateIso, quantiteValide,
} from '../utils/validation.js';
import {
  listerFactures, obtenirFacture, creerFacture, modifierFacture, annulerFacture,
} from '../services/facture.service.js';

const TYPES = ['vente', 'achat'];
const STATUTS = ['impayee', 'partielle', 'payee', 'annulee'];
const MAX_LIGNES = 100;

// Les montants HT, TVA et TTC ne sont jamais lus dans la requête : ils sont recalculés par le serveur.
function lireFacture(b = {}) {
  const date_emission = dateIso(b.date_emission, "date d'émission");
  const date_echeance = dateIso(b.date_echeance, "date d'échéance");
  if (date_echeance < date_emission) { // RG13
    throw new HttpError(400, "La date d'échéance ne peut pas précéder la date d'émission.");
  }
  if (!Array.isArray(b.lignes) || b.lignes.length === 0) { // RG10
    throw new HttpError(400, 'Une facture doit comporter au moins une ligne.');
  }
  if (b.lignes.length > MAX_LIGNES) {
    throw new HttpError(400, `Une facture ne peut pas dépasser ${MAX_LIGNES} lignes.`);
  }
  return {
    numero_facture: texteRequis(b.numero_facture, 'numéro de facture', 30),
    type_facture: choixParmi(b.type_facture, 'type de facture', TYPES),
    id_tiers: identifiant(b.id_tiers),
    date_emission,
    date_echeance,
    lignes: b.lignes.map((l) => ({
      designation_ligne: texteRequis(l?.designation_ligne, 'désignation', 150),
      quantite: quantiteValide(l?.quantite),
      prix_unitaire_ht: montant(l?.prix_unitaire_ht, 'prix unitaire HT'),
    })),
  };
}

export const lister = asyncHandler(async (req, res) => {
  const q = req.query;
  if (q.type !== undefined) choixParmi(q.type, 'type', TYPES);
  if (q.statut !== undefined) choixParmi(q.statut, 'statut', STATUTS);

  res.json(
    await listerFactures(req.user.id_entreprise, {
      type: q.type,
      statut: q.statut,
      id_tiers: q.id_tiers !== undefined ? identifiant(q.id_tiers) : undefined,
      du: q.du !== undefined ? dateIso(q.du, 'du') : undefined,
      au: q.au !== undefined ? dateIso(q.au, 'au') : undefined,
      echues: q.echues === 'true',
      q: typeof q.q === 'string' && q.q.trim() ? q.q.trim().slice(0, 100) : null,
      page: Math.max(1, parseInt(q.page, 10) || 1),
      limit: Math.min(100, Math.max(1, parseInt(q.limit, 10) || 20)),
    })
  );
});

export const obtenir = asyncHandler(async (req, res) => {
  res.json(await obtenirFacture(identifiant(req.params.id), req.user.id_entreprise));
});

export const creer = asyncHandler(async (req, res) => {
  res.status(201).json(await creerFacture(req.user.id_entreprise, lireFacture(req.body)));
});

export const modifier = asyncHandler(async (req, res) => {
  res.json(
    await modifierFacture(identifiant(req.params.id), req.user.id_entreprise, lireFacture(req.body))
  );
});

export const annuler = asyncHandler(async (req, res) => {
  res.json(await annulerFacture(identifiant(req.params.id), req.user.id_entreprise));
});

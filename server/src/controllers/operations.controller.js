import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import {
  texteOptionnel, choixParmi, identifiant, montantPositif, dateIso,
} from '../utils/validation.js';
import {
  listerOperations, obtenirOperation, creerOperation, modifierOperation,
  supprimerOperation, ajouterReglements, retirerReglement,
} from '../services/operation.service.js';

const TYPES = ['encaissement', 'decaissement'];
const MODES = ['especes', 'cheque', 'virement', 'mobile_money'];
const MAX_REGLEMENTS = 50;

function lireReglements(liste, { obligatoire }) {
  if (liste === undefined || liste === null) liste = [];
  if (!Array.isArray(liste)) throw new HttpError(400, 'Le champ « reglements » doit être une liste.');
  if (obligatoire && liste.length === 0) throw new HttpError(400, 'Au moins un règlement est requis.');
  if (liste.length > MAX_REGLEMENTS) {
    throw new HttpError(400, `Au plus ${MAX_REGLEMENTS} règlements par requête.`);
  }
  const reglements = liste.map((r) => ({
    id_facture: identifiant(r?.id_facture),
    montant_affecte: montantPositif(r?.montant_affecte, 'montant affecté'),
  }));
  if (new Set(reglements.map((r) => r.id_facture)).size !== reglements.length) {
    throw new HttpError(400, "Une facture ne peut apparaître qu'une fois dans la liste.");
  }
  return reglements;
}

function lireOperation(b = {}) {
  return {
    date_operation: dateIso(b.date_operation, "date de l'opération"),
    type_operation: choixParmi(b.type_operation, "type d'opération", TYPES),
    montant_operation: montantPositif(b.montant_operation, 'montant'), // RG16
    mode_paiement: choixParmi(b.mode_paiement, 'mode de paiement', MODES),
    reference_operation: texteOptionnel(b.reference_operation, 'référence', 50),
    libelle_operation: texteOptionnel(b.libelle_operation, 'libellé', 150),
    id_compte: identifiant(b.id_compte),
    id_categorie: identifiant(b.id_categorie),
  };
}

export const lister = asyncHandler(async (req, res) => {
  const q = req.query;
  if (q.type !== undefined) choixParmi(q.type, 'type', TYPES);
  res.json(
    await listerOperations(req.user.id_entreprise, {
      type: q.type,
      id_compte: q.id_compte !== undefined ? identifiant(q.id_compte) : undefined,
      id_categorie: q.id_categorie !== undefined ? identifiant(q.id_categorie) : undefined,
      du: q.du !== undefined ? dateIso(q.du, 'du') : undefined,
      au: q.au !== undefined ? dateIso(q.au, 'au') : undefined,
      q: typeof q.q === 'string' && q.q.trim() ? q.q.trim().slice(0, 100) : null,
      page: Math.max(1, parseInt(q.page, 10) || 1),
      limit: Math.min(100, Math.max(1, parseInt(q.limit, 10) || 20)),
    })
  );
});

export const obtenir = asyncHandler(async (req, res) => {
  res.json(await obtenirOperation(identifiant(req.params.id), req.user.id_entreprise));
});

export const creer = asyncHandler(async (req, res) => {
  const data = {
    ...lireOperation(req.body),
    reglements: lireReglements(req.body?.reglements, { obligatoire: false }),
  };
  // L'utilisateur qui saisit vient du jeton (association SAISIR du MCD)
  res.status(201).json(await creerOperation(req.user.id_entreprise, req.user.id_utilisateur, data));
});

export const modifier = asyncHandler(async (req, res) => {
  res.json(
    await modifierOperation(identifiant(req.params.id), req.user.id_entreprise, lireOperation(req.body))
  );
});

export const supprimer = asyncHandler(async (req, res) => {
  await supprimerOperation(identifiant(req.params.id), req.user.id_entreprise);
  res.status(204).end();
});

export const ajouterReglement = asyncHandler(async (req, res) => {
  const reglements = lireReglements(req.body?.reglements, { obligatoire: true });
  res
    .status(201)
    .json(await ajouterReglements(identifiant(req.params.id), req.user.id_entreprise, reglements));
});

export const retirerReglementFacture = asyncHandler(async (req, res) => {
  res.json(
    await retirerReglement(
      identifiant(req.params.id), identifiant(req.params.idFacture), req.user.id_entreprise
    )
  );
});
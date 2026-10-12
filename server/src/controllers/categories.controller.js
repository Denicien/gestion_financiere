import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import { texteRequis, choixParmi, identifiant } from '../utils/validation.js';
import {
  listerCategories, obtenirCategorie, creerCategorie, modifierCategorie, supprimerCategorie,
} from '../services/categorie.service.js';

const TYPES = ['recette', 'depense'];

function lireCategorie(b = {}) {
  return {
    libelle_categorie: texteRequis(b.libelle_categorie, 'libellé', 80),
    type_categorie: choixParmi(b.type_categorie, 'type', TYPES),
  };
}

export const lister = asyncHandler(async (req, res) => {
  const { type } = req.query;
  if (type !== undefined && !TYPES.includes(type)) {
    throw new HttpError(400, `Le filtre « type » doit valoir : ${TYPES.join(', ')}.`);
  }
  res.json(await listerCategories(req.user.id_entreprise, type));
});

export const obtenir = asyncHandler(async (req, res) => {
  res.json(await obtenirCategorie(identifiant(req.params.id), req.user.id_entreprise));
});

export const creer = asyncHandler(async (req, res) => {
  res.status(201).json(await creerCategorie(req.user.id_entreprise, lireCategorie(req.body)));
});

export const modifier = asyncHandler(async (req, res) => {
  res.json(
    await modifierCategorie(identifiant(req.params.id), req.user.id_entreprise, lireCategorie(req.body))
  );
});

export const supprimer = asyncHandler(async (req, res) => {
  await supprimerCategorie(identifiant(req.params.id), req.user.id_entreprise);
  res.status(204).end();
});

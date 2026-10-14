import { HttpError } from './httpError.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function texteRequis(valeur, nom, max) {
  if (typeof valeur !== 'string' || !valeur.trim()) {
    throw new HttpError(400, `Le champ « ${nom} » est obligatoire.`);
  }
  const v = valeur.trim();
  if (v.length > max) {
    throw new HttpError(400, `Le champ « ${nom} » dépasse ${max} caractères.`);
  }
  return v;
}

export function texteOptionnel(valeur, nom, max) {
  if (valeur === undefined || valeur === null || valeur === '') return null;
  return texteRequis(valeur, nom, max);
}

export function emailValide(valeur) {
  const v = texteRequis(valeur, 'e-mail', 100).toLowerCase();
  if (!EMAIL_RE.test(v)) throw new HttpError(400, "L'adresse e-mail n'est pas valide.");
  return v;
}

export function emailOptionnel(valeur) {
  if (valeur === undefined || valeur === null || valeur === '') return null;
  return emailValide(valeur);
}

export function motDePasseValide(valeur) {
  if (typeof valeur !== 'string' || valeur.length < 8) {
    throw new HttpError(400, 'Le mot de passe doit contenir au moins 8 caractères.');
  }
  if (Buffer.byteLength(valeur, 'utf8') > 72) {
    throw new HttpError(400, 'Le mot de passe est trop long (72 octets maximum).');
  }
  return valeur;
}

// RG7 : le taux de TVA est obligatoire si l'entreprise est assujettie
export function tauxTva(assujetti, taux) {
  if (!assujetti) return null;
  const n = Number(taux);
  if (taux === undefined || taux === null || taux === '' || Number.isNaN(n) || n < 0 || n > 100) {
    throw new HttpError(
      400,
      'Un taux de TVA compris entre 0 et 100 est obligatoire pour une entreprise assujettie.'
    );
  }
  return n;
}

export function choixParmi(valeur, nom, liste) {
  if (!liste.includes(valeur)) {
    throw new HttpError(400, `Le champ « ${nom} » doit valoir : ${liste.join(', ')}.`);
  }
  return valeur;
}

export function identifiant(valeur) {
  const n = Number(valeur);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Identifiant invalide.');
  return n;
}

// Montant en Ariary : positif ou nul, 13 chiffres et 2 décimales au plus (DECIMAL(15,2)).
// La valeur reste une chaîne pour éviter toute erreur d'arrondi des flottants.
export function montant(valeur, nom, { defaut } = {}) {
  if ((valeur === undefined || valeur === null || valeur === '') && defaut !== undefined) {
    return defaut;
  }
  const s = String(valeur ?? '').trim();
  if (!/^\d{1,13}(\.\d{1,2})?$/.test(s)) {
    throw new HttpError(
      400,
      `Le champ « ${nom} » doit être un montant positif ou nul (2 décimales au maximum).`
    );
  }
  return s;
}

// Montant strictement supérieur à zéro (RG16)
export function montantPositif(valeur, nom) {
  const s = montant(valeur, nom);
  if (!/[1-9]/.test(s)) {
    throw new HttpError(400, `Le champ « ${nom} » doit être strictement positif.`);
  }
  return s;
}

// Date au format AAAA-MM-JJ, jour réellement existant
export function dateIso(valeur, nom) {
  const s = typeof valeur === 'string' ? valeur.trim() : '';
  const d = new Date(`${s}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
    throw new HttpError(400, `Le champ « ${nom} » doit être une date valide au format AAAA-MM-JJ.`);
  }
  return s;
}

// Quantité strictement positive : DECIMAL(10,2)
export function quantiteValide(valeur) {
  const s = String(valeur ?? '').trim();
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(s) || Number(s) <= 0) {
    throw new HttpError(400, 'La quantité doit être strictement positive (2 décimales au maximum).');
  }
  return s;
}
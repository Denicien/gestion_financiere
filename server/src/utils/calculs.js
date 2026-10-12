import { HttpError } from './httpError.js';

// Calculs monétaires exacts : tout est converti en centièmes (BigInt), jamais en flottants.
// Plafond : DECIMAL(15,2) soit 10^15 - 1 centièmes.
const PLAFOND = 999999999999999n;

function versCentiemes(valeur) {
  const [entier, decimales = ''] = String(valeur).split('.');
  if (decimales.length > 2) throw new HttpError(400, 'Deux décimales au maximum.');
  return BigInt(entier + decimales.padEnd(2, '0'));
}

function enChaine(centiemes) {
  const s = centiemes.toString().padStart(3, '0');
  return `${s.slice(0, -2)}.${s.slice(-2)}`;
}

// Division avec arrondi à l'entier le plus proche (valeurs positives)
const diviser = (n, d) => (n + d / 2n) / d;

function totalLigne(quantite, prixUnitaire) {
  return diviser(versCentiemes(quantite) * versCentiemes(prixUnitaire), 100n);
}

// RG14 : montant HT d'une ligne = quantité × prix unitaire HT
export function montantLigne(quantite, prixUnitaire) {
  return enChaine(totalLigne(quantite, prixUnitaire));
}

// RG7, RG8, RG14 : HT = somme des lignes, TVA = HT × taux (nulle si non assujettie), TTC = HT + TVA
export function calculerTotaux(lignes, tauxTva) {
  const ht = lignes.reduce((somme, l) => somme + totalLigne(l.quantite, l.prix_unitaire_ht), 0n);
  const tva = tauxTva === null || tauxTva === undefined
    ? 0n
    : diviser(ht * versCentiemes(tauxTva), 10000n);
  const ttc = ht + tva;

  if (ttc > PLAFOND) throw new HttpError(400, 'Le montant total de la facture est trop élevé.');
  return { montant_ht: enChaine(ht), montant_tva: enChaine(tva), montant_ttc: enChaine(ttc) };
}

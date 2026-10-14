import { HttpError } from './httpError.js';

// Plafond : DECIMAL(15,2) soit 10^15 - 1 centièmes.
const PLAFOND = 999999999999999n;

// "1234.5" -> 123450n
export function centiemes(valeur) {
  const [entier, decimales = ''] = String(valeur).split('.');
  if (decimales.length > 2) throw new HttpError(400, 'Deux décimales au maximum.');
  return BigInt(entier + decimales.padEnd(2, '0'));
}


// 123450n -> "1234.50"   (-150000n -> "-1500.00")
export function enMontant(c) {
  const negatif = c < 0n;
  const s = (negatif ? -c : c).toString().padStart(3, '0');
  return `${negatif ? '-' : ''}${s.slice(0, -2)}.${s.slice(-2)}`;
}

// Division avec arrondi à l'entier le plus proche (valeurs positives)
const diviser = (n, d) => (n + d / 2n) / d;

function totalLigne(quantite, prixUnitaire) {
  return diviser(centiemes(quantite) * centiemes(prixUnitaire), 100n);
}

// RG14 : montant HT d'une ligne = quantité × prix unitaire HT
export function montantLigne(quantite, prixUnitaire) {
  return enMontant(totalLigne(quantite, prixUnitaire));
}

// RG7, RG8, RG14 : HT = somme des lignes, TVA = HT × taux (nulle si non assujettie), TTC = HT + TVA
export function calculerTotaux(lignes, tauxTva) {
  const ht = lignes.reduce((somme, l) => somme + totalLigne(l.quantite, l.prix_unitaire_ht), 0n);
  const tva = tauxTva === null || tauxTva === undefined
    ? 0n
    : diviser(ht * centiemes(tauxTva), 10000n);
  const ttc = ht + tva;

  if (ttc > PLAFOND) throw new HttpError(400, 'Le montant total de la facture est trop élevé.');
  return { montant_ht: enMontant(ht), montant_tva: enMontant(tva), montant_ttc: enMontant(ttc) };
}
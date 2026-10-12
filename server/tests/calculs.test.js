import test from 'node:test';
import assert from 'node:assert/strict';
import { calculerTotaux, montantLigne } from '../src/utils/calculs.js';

test('HT, TVA et TTC avec une TVA de 20 %', () => {
  const lignes = [
    { quantite: '2', prix_unitaire_ht: '1000' },
    { quantite: '1.5', prix_unitaire_ht: '3333.33' }, // 4999,995 arrondi à 5000,00
  ];
  assert.deepEqual(calculerTotaux(lignes, '20.00'), {
    montant_ht: '7000.00',
    montant_tva: '1400.00',
    montant_ttc: '8400.00',
  });
});

test('entreprise non assujettie : TVA nulle et TTC égal au HT (RG7)', () => {
  const r = calculerTotaux([{ quantite: '3', prix_unitaire_ht: '2500' }], null);
  assert.deepEqual(r, { montant_ht: '7500.00', montant_tva: '0.00', montant_ttc: '7500.00' });
});

test('arrondi au centième le plus proche', () => {
  const r = calculerTotaux([{ quantite: '1', prix_unitaire_ht: '0.05' }], '20');
  assert.equal(r.montant_tva, '0.01');
});

test('grands montants sans perte de précision', () => {
  const r = calculerTotaux([{ quantite: '3', prix_unitaire_ht: '1234567890123.45' }], null);
  assert.equal(r.montant_ht, '3703703670370.35');
});

test('montant d\'une ligne', () => {
  assert.equal(montantLigne('1.25', '80'), '100.00');
});

test('dépassement de la capacité DECIMAL(15,2) refusé', () => {
  assert.throws(
    () => calculerTotaux([{ quantite: '99999999.99', prix_unitaire_ht: '9999999999999.99' }], null),
    { status: 400 }
  );
});

import { pool } from '../config/db.js';
import { HttpError } from '../utils/httpError.js';

// Le solde actuel n'est jamais stocké : il se calcule à partir du solde initial
// et des opérations (RG17). C'est un principe de Merise : on ne mémorise pas une donnée calculable.
const SELECT_COMPTE = `
  SELECT c.id_compte, c.nom_compte, c.type_compte, c.numero_compte,
         c.solde_initial, c.statut_compte,
         c.solde_initial + COALESCE(SUM(CASE o.type_operation
             WHEN 'encaissement' THEN o.montant_operation
             WHEN 'decaissement' THEN -o.montant_operation
         END), 0) AS solde_actuel
    FROM compte c
    LEFT JOIN operation o ON o.id_compte = c.id_compte
   WHERE c.id_entreprise = ?`;

const GROUPE = `
   GROUP BY c.id_compte, c.nom_compte, c.type_compte, c.numero_compte,
            c.solde_initial, c.statut_compte`;

export async function listerComptes(idEntreprise, statut) {
  const params = [idEntreprise];
  let filtre = '';
  if (statut) {
    filtre = ' AND c.statut_compte = ?';
    params.push(statut);
  }
  const [rows] = await pool.query(`${SELECT_COMPTE}${filtre}${GROUPE} ORDER BY c.nom_compte`, params);
  return rows;
}

export async function obtenirCompte(idCompte, idEntreprise) {
  const [rows] = await pool.query(`${SELECT_COMPTE} AND c.id_compte = ?${GROUPE}`, [
    idEntreprise,
    idCompte,
  ]);
  if (rows.length === 0) throw new HttpError(404, 'Compte introuvable.');
  return rows[0];
}

export async function creerCompte(idEntreprise, d) {
  const [r] = await pool.query(
    `INSERT INTO compte (nom_compte, type_compte, numero_compte, solde_initial, id_entreprise)
     VALUES (?, ?, ?, ?, ?)`,
    [d.nom_compte, d.type_compte, d.numero_compte, d.solde_initial, idEntreprise]
  );
  return obtenirCompte(r.insertId, idEntreprise);
}

export async function modifierCompte(idCompte, idEntreprise, d) {
  const actuel = await obtenirCompte(idCompte, idEntreprise);

  // Changer le solde d'ouverture après des opérations fausserait l'historique
  if (Number(d.solde_initial) !== Number(actuel.solde_initial)) {
    const [[{ n }]] = await pool.query(
      'SELECT COUNT(*) AS n FROM operation WHERE id_compte = ?',
      [idCompte]
    );
    if (n > 0) {
      throw new HttpError(
        409,
        "Le solde initial ne peut plus être modifié : des opérations existent sur ce compte."
      );
    }
  }
  await pool.query(
    `UPDATE compte
        SET nom_compte = ?, type_compte = ?, numero_compte = ?, solde_initial = ?
      WHERE id_compte = ? AND id_entreprise = ?`,
    [d.nom_compte, d.type_compte, d.numero_compte, d.solde_initial, idCompte, idEntreprise]
  );
  return obtenirCompte(idCompte, idEntreprise);
}

// RG22 : un compte utilisé ne se supprime pas, il se clôture
export async function changerStatutCompte(idCompte, idEntreprise, statut) {
  await obtenirCompte(idCompte, idEntreprise);
  await pool.query('UPDATE compte SET statut_compte = ? WHERE id_compte = ? AND id_entreprise = ?', [
    statut,
    idCompte,
    idEntreprise,
  ]);
  return obtenirCompte(idCompte, idEntreprise);
}

export async function supprimerCompte(idCompte, idEntreprise) {
  await obtenirCompte(idCompte, idEntreprise);
  try {
    await pool.query('DELETE FROM compte WHERE id_compte = ? AND id_entreprise = ?', [
      idCompte,
      idEntreprise,
    ]);
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      throw new HttpError(
        409,
        'Ce compte a des opérations et ne peut pas être supprimé : clôturez-le à la place.'
      );
    }
    throw err;
  }
}

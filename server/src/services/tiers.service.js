import { pool } from '../config/db.js';
import { HttpError } from '../utils/httpError.js';

// Chaque requête filtre par id_entreprise (RG6) : une PME ne voit jamais les tiers d'une autre.

export async function listerTiers(idEntreprise, { type, q, page, limit }) {
  const where = ['id_entreprise = ?'];
  const params = [idEntreprise];

  if (type) {
    // un tiers « les_deux » est à la fois client et fournisseur
    where.push('type_tiers IN (?, ?)');
    params.push(type, 'les_deux');
  }
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    where.push('(nom_tiers LIKE ? OR email_tiers LIKE ? OR telephone_tiers LIKE ?)');
    params.push(like, like, like);
  }
  const clause = where.join(' AND ');

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM tiers WHERE ${clause}`,
    params
  );
  const [rows] = await pool.query(
    `SELECT id_tiers, nom_tiers, type_tiers, nif_tiers, adresse_tiers,
            telephone_tiers, email_tiers
       FROM tiers
      WHERE ${clause}
      ORDER BY nom_tiers
      LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit]
  );
  return { donnees: rows, total, page, limit };
}

export async function obtenirTiers(idTiers, idEntreprise) {
  const [rows] = await pool.query(
    `SELECT id_tiers, nom_tiers, type_tiers, nif_tiers, adresse_tiers,
            telephone_tiers, email_tiers
       FROM tiers
      WHERE id_tiers = ? AND id_entreprise = ?`,
    [idTiers, idEntreprise]
  );
  // 404 et non 403 : on ne révèle pas l'existence d'un tiers d'une autre entreprise
  if (rows.length === 0) throw new HttpError(404, 'Tiers introuvable.');
  return rows[0];
}

export async function creerTiers(idEntreprise, d) {
  const [r] = await pool.query(
    `INSERT INTO tiers
      (nom_tiers, type_tiers, nif_tiers, adresse_tiers, telephone_tiers, email_tiers, id_entreprise)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [d.nom_tiers, d.type_tiers, d.nif_tiers, d.adresse_tiers, d.telephone_tiers, d.email_tiers, idEntreprise]
  );
  return obtenirTiers(r.insertId, idEntreprise);
}

export async function modifierTiers(idTiers, idEntreprise, d) {
  await obtenirTiers(idTiers, idEntreprise); // 404 si le tiers n'appartient pas à l'entreprise
  await pool.query(
    `UPDATE tiers
        SET nom_tiers = ?, type_tiers = ?, nif_tiers = ?, adresse_tiers = ?,
            telephone_tiers = ?, email_tiers = ?
      WHERE id_tiers = ? AND id_entreprise = ?`,
    [d.nom_tiers, d.type_tiers, d.nif_tiers, d.adresse_tiers, d.telephone_tiers, d.email_tiers, idTiers, idEntreprise]
  );
  return obtenirTiers(idTiers, idEntreprise);
}

export async function supprimerTiers(idTiers, idEntreprise) {
  await obtenirTiers(idTiers, idEntreprise);
  try {
    await pool.query('DELETE FROM tiers WHERE id_tiers = ? AND id_entreprise = ?', [idTiers, idEntreprise]);
  } catch (err) {
    // Clé étrangère : le tiers est déjà utilisé par des factures
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      throw new HttpError(409, 'Ce tiers est utilisé par des factures et ne peut pas être supprimé.');
    }
    throw err;
  }
}

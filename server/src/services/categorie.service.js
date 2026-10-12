import { pool } from '../config/db.js';
import { HttpError } from '../utils/httpError.js';

export async function listerCategories(idEntreprise, type) {
  const params = [idEntreprise];
  let filtre = '';
  if (type) {
    filtre = ' AND type_categorie = ?';
    params.push(type);
  }
  const [rows] = await pool.query(
    `SELECT id_categorie, libelle_categorie, type_categorie
       FROM categorie
      WHERE id_entreprise = ?${filtre}
      ORDER BY type_categorie, libelle_categorie`,
    params
  );
  return rows;
}

export async function obtenirCategorie(idCategorie, idEntreprise) {
  const [rows] = await pool.query(
    `SELECT id_categorie, libelle_categorie, type_categorie
       FROM categorie
      WHERE id_categorie = ? AND id_entreprise = ?`,
    [idCategorie, idEntreprise]
  );
  if (rows.length === 0) throw new HttpError(404, 'Catégorie introuvable.');
  return rows[0];
}

async function verifierUnicite(idEntreprise, libelle, type, ignorerId = 0) {
  const [rows] = await pool.query(
    `SELECT 1 FROM categorie
      WHERE id_entreprise = ? AND type_categorie = ?
        AND libelle_categorie = ? AND id_categorie <> ?
      LIMIT 1`,
    [idEntreprise, type, libelle, ignorerId]
  );
  if (rows.length > 0) {
    throw new HttpError(409, 'Une catégorie portant ce nom existe déjà pour ce type.');
  }
}

export async function creerCategorie(idEntreprise, d) {
  await verifierUnicite(idEntreprise, d.libelle_categorie, d.type_categorie);
  const [r] = await pool.query(
    'INSERT INTO categorie (libelle_categorie, type_categorie, id_entreprise) VALUES (?, ?, ?)',
    [d.libelle_categorie, d.type_categorie, idEntreprise]
  );
  return obtenirCategorie(r.insertId, idEntreprise);
}

export async function modifierCategorie(idCategorie, idEntreprise, d) {
  const actuelle = await obtenirCategorie(idCategorie, idEntreprise);

  // RG18 : une opération doit garder une catégorie de même nature
  if (d.type_categorie !== actuelle.type_categorie) {
    const [[{ n }]] = await pool.query(
      'SELECT COUNT(*) AS n FROM operation WHERE id_categorie = ?',
      [idCategorie]
    );
    if (n > 0) {
      throw new HttpError(
        409,
        'Le type de cette catégorie ne peut plus changer : des opérations l\'utilisent.'
      );
    }
  }
  await verifierUnicite(idEntreprise, d.libelle_categorie, d.type_categorie, idCategorie);
  await pool.query(
    `UPDATE categorie SET libelle_categorie = ?, type_categorie = ?
      WHERE id_categorie = ? AND id_entreprise = ?`,
    [d.libelle_categorie, d.type_categorie, idCategorie, idEntreprise]
  );
  return obtenirCategorie(idCategorie, idEntreprise);
}

export async function supprimerCategorie(idCategorie, idEntreprise) {
  await obtenirCategorie(idCategorie, idEntreprise);
  try {
    await pool.query('DELETE FROM categorie WHERE id_categorie = ? AND id_entreprise = ?', [
      idCategorie,
      idEntreprise,
    ]);
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      throw new HttpError(409, 'Cette catégorie est utilisée par des opérations et ne peut pas être supprimée.');
    }
    throw err;
  }
}

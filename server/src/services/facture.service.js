import { pool } from '../config/db.js';
import { HttpError } from '../utils/httpError.js';
import { calculerTotaux, montantLigne } from '../utils/calculs.js';

const COLONNES = `f.id_facture, f.numero_facture, f.type_facture, f.date_emission,
  f.date_echeance, f.montant_ht, f.montant_tva, f.montant_ttc, f.statut_facture,
  f.id_tiers, t.nom_tiers`;

// Le montant réglé et le reste à payer se calculent à partir des règlements : ils ne sont pas stockés.
const SELECT_FACTURE = `
  SELECT ${COLONNES},
         COALESCE(SUM(r.montant_affecte), 0) AS montant_regle,
         f.montant_ttc - COALESCE(SUM(r.montant_affecte), 0) AS reste_a_payer
    FROM facture f
    JOIN tiers t ON t.id_tiers = f.id_tiers
    LEFT JOIN regler r ON r.id_facture = f.id_facture`;
const GROUPE = ` GROUP BY ${COLONNES}`;

export async function listerFactures(idEntreprise, f) {
  const where = ['f.id_entreprise = ?'];
  const params = [idEntreprise];

  if (f.type) { where.push('f.type_facture = ?'); params.push(f.type); }
  if (f.statut) { where.push('f.statut_facture = ?'); params.push(f.statut); }
  if (f.id_tiers) { where.push('f.id_tiers = ?'); params.push(f.id_tiers); }
  if (f.du) { where.push('f.date_emission >= ?'); params.push(f.du); }
  if (f.au) { where.push('f.date_emission <= ?'); params.push(f.au); }
  if (f.echues) {
    where.push("f.statut_facture IN ('impayee', 'partielle') AND f.date_echeance < CURDATE()");
  }
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, '\\$&')}%`;
    where.push('(f.numero_facture LIKE ? OR t.nom_tiers LIKE ?)');
    params.push(like, like);
  }
  const clause = where.join(' AND ');

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM facture f JOIN tiers t ON t.id_tiers = f.id_tiers WHERE ${clause}`,
    params
  );
  const [rows] = await pool.query(
    `${SELECT_FACTURE} WHERE ${clause}${GROUPE}
      ORDER BY f.date_emission DESC, f.id_facture DESC
      LIMIT ? OFFSET ?`,
    [...params, f.limit, (f.page - 1) * f.limit]
  );
  return { donnees: rows, total, page: f.page, limit: f.limit };
}

export async function obtenirFacture(idFacture, idEntreprise) {
  const [rows] = await pool.query(
    `${SELECT_FACTURE} WHERE f.id_entreprise = ? AND f.id_facture = ?${GROUPE}`,
    [idEntreprise, idFacture]
  );
  // 404 : on ne révèle pas l'existence d'une facture d'une autre entreprise
  if (rows.length === 0) throw new HttpError(404, 'Facture introuvable.');

  const [lignes] = await pool.query(
    `SELECT id_ligne, designation_ligne, quantite, prix_unitaire_ht
       FROM ligne_facture WHERE id_facture = ? ORDER BY id_ligne`,
    [idFacture]
  );
  const [reglements] = await pool.query(
    `SELECT r.id_operation, o.date_operation, o.mode_paiement, r.montant_affecte
       FROM regler r JOIN operation o ON o.id_operation = r.id_operation
      WHERE r.id_facture = ? ORDER BY o.date_operation, r.id_operation`,
    [idFacture]
  );
  return {
    ...rows[0],
    lignes: lignes.map((l) => ({
      ...l,
      montant_ht: montantLigne(l.quantite, l.prix_unitaire_ht),
    })),
    reglements,
  };
}

async function tauxDeLEntreprise(conn, idEntreprise) {
  const [rows] = await conn.query(
    'SELECT assujetti_tva, taux_tva FROM entreprise WHERE id_entreprise = ?',
    [idEntreprise]
  );
  if (rows.length === 0) throw new HttpError(404, 'Entreprise introuvable.');
  return rows[0].assujetti_tva ? rows[0].taux_tva : null;
}

// RG9, RG10, RG11 : le tiers appartient à l'entreprise et son type correspond au sens de la facture
async function verifierTiers(conn, idEntreprise, idTiers, typeFacture) {
  const [rows] = await conn.query(
    'SELECT type_tiers FROM tiers WHERE id_tiers = ? AND id_entreprise = ?',
    [idTiers, idEntreprise]
  );
  if (rows.length === 0) throw new HttpError(400, 'Tiers introuvable dans votre entreprise.');

  const acceptes = typeFacture === 'vente' ? ['client', 'les_deux'] : ['fournisseur', 'les_deux'];
  if (!acceptes.includes(rows[0].type_tiers)) {
    throw new HttpError(
      400,
      typeFacture === 'vente'
        ? 'Une facture de vente doit être émise à un client.'
        : "Une facture d'achat doit provenir d'un fournisseur."
    );
  }
}

async function insererLignes(conn, idFacture, lignes) {
  await conn.query(
    'INSERT INTO ligne_facture (designation_ligne, quantite, prix_unitaire_ht, id_facture) VALUES ?',
    [lignes.map((l) => [l.designation_ligne, l.quantite, l.prix_unitaire_ht, idFacture])]
  );
}

// Facture et lignes sont enregistrées dans une même transaction
export async function creerFacture(idEntreprise, d) {
  const conn = await pool.getConnection();
  let idFacture;
  try {
    await conn.beginTransaction();
    await verifierTiers(conn, idEntreprise, d.id_tiers, d.type_facture);
    const totaux = calculerTotaux(d.lignes, await tauxDeLEntreprise(conn, idEntreprise));

    const [r] = await conn.query(
      `INSERT INTO facture
        (numero_facture, type_facture, date_emission, date_echeance,
         montant_ht, montant_tva, montant_ttc, statut_facture, id_tiers, id_entreprise)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'impayee', ?, ?)`,
      [
        d.numero_facture, d.type_facture, d.date_emission, d.date_echeance,
        totaux.montant_ht, totaux.montant_tva, totaux.montant_ttc, d.id_tiers, idEntreprise,
      ]
    );
    idFacture = r.insertId;
    await insererLignes(conn, idFacture, d.lignes);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      throw new HttpError(409, 'Ce numéro de facture existe déjà dans votre entreprise.');
    }
    throw err;
  } finally {
    conn.release();
  }
  return obtenirFacture(idFacture, idEntreprise);
}

// Verrouille la facture et vérifie qu'elle est modifiable : ni annulée, ni déjà réglée en partie
async function verrouillerModifiable(conn, idFacture, idEntreprise) {
  const [rows] = await conn.query(
    'SELECT statut_facture FROM facture WHERE id_facture = ? AND id_entreprise = ? FOR UPDATE',
    [idFacture, idEntreprise]
  );
  if (rows.length === 0) throw new HttpError(404, 'Facture introuvable.');
  if (rows[0].statut_facture === 'annulee') throw new HttpError(409, 'Cette facture est annulée.');

  const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM regler WHERE id_facture = ?', [
    idFacture,
  ]);
  if (n > 0) {
    throw new HttpError(409, 'Cette facture a des règlements : elle ne peut plus être modifiée.');
  }
}

export async function modifierFacture(idFacture, idEntreprise, d) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await verrouillerModifiable(conn, idFacture, idEntreprise);
    await verifierTiers(conn, idEntreprise, d.id_tiers, d.type_facture);
    const totaux = calculerTotaux(d.lignes, await tauxDeLEntreprise(conn, idEntreprise));

    await conn.query(
      `UPDATE facture
          SET numero_facture = ?, type_facture = ?, date_emission = ?, date_echeance = ?,
              montant_ht = ?, montant_tva = ?, montant_ttc = ?, id_tiers = ?
        WHERE id_facture = ? AND id_entreprise = ?`,
      [
        d.numero_facture, d.type_facture, d.date_emission, d.date_echeance,
        totaux.montant_ht, totaux.montant_tva, totaux.montant_ttc, d.id_tiers,
        idFacture, idEntreprise,
      ]
    );
    await conn.query('DELETE FROM ligne_facture WHERE id_facture = ?', [idFacture]);
    await insererLignes(conn, idFacture, d.lignes);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      throw new HttpError(409, 'Ce numéro de facture existe déjà dans votre entreprise.');
    }
    throw err;
  } finally {
    conn.release();
  }
  return obtenirFacture(idFacture, idEntreprise);
}

// Une facture ne se supprime pas : elle s'annule, ce qui conserve la numérotation et l'historique
export async function annulerFacture(idFacture, idEntreprise) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await verrouillerModifiable(conn, idFacture, idEntreprise);
    await conn.query(
      "UPDATE facture SET statut_facture = 'annulee' WHERE id_facture = ? AND id_entreprise = ?",
      [idFacture, idEntreprise]
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return obtenirFacture(idFacture, idEntreprise);
}
import { pool } from '../config/db.js';
import { HttpError } from '../utils/httpError.js';
import { centiemes } from '../utils/calculs.js';

const COLONNES = `o.id_operation, o.date_operation, o.type_operation, o.montant_operation,
  o.mode_paiement, o.reference_operation, o.libelle_operation,
  o.id_compte, c.nom_compte, o.id_categorie, k.libelle_categorie, o.id_utilisateur`;

// La part affectée à des factures se calcule depuis les règlements : elle n'est pas stockée.
const SELECT_OPERATION = `
  SELECT ${COLONNES},
         COALESCE(SUM(r.montant_affecte), 0) AS montant_affecte,
         o.montant_operation - COALESCE(SUM(r.montant_affecte), 0) AS montant_non_affecte
    FROM operation o
    JOIN compte c ON c.id_compte = o.id_compte
    JOIN categorie k ON k.id_categorie = o.id_categorie
    LEFT JOIN regler r ON r.id_operation = o.id_operation`;
const GROUPE = ` GROUP BY ${COLONNES}`;

const FROM_FILTRE = `FROM operation o
    JOIN compte c ON c.id_compte = o.id_compte
    JOIN categorie k ON k.id_categorie = o.id_categorie`;

export async function listerOperations(idEntreprise, f) {
  const where = ['c.id_entreprise = ?'];
  const params = [idEntreprise];

  if (f.type) { where.push('o.type_operation = ?'); params.push(f.type); }
  if (f.id_compte) { where.push('o.id_compte = ?'); params.push(f.id_compte); }
  if (f.id_categorie) { where.push('o.id_categorie = ?'); params.push(f.id_categorie); }
  if (f.du) { where.push('o.date_operation >= ?'); params.push(f.du); }
  if (f.au) { where.push('o.date_operation <= ?'); params.push(f.au); }
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, '\\$&')}%`;
    where.push('(o.libelle_operation LIKE ? OR o.reference_operation LIKE ? OR k.libelle_categorie LIKE ?)');
    params.push(like, like, like);
  }
  const clause = where.join(' AND ');

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${FROM_FILTRE} WHERE ${clause}`, params);
  const [rows] = await pool.query(
    `${SELECT_OPERATION} WHERE ${clause}${GROUPE}
      ORDER BY o.date_operation DESC, o.id_operation DESC
      LIMIT ? OFFSET ?`,
    [...params, f.limit, (f.page - 1) * f.limit]
  );
  return { donnees: rows, total, page: f.page, limit: f.limit };
}

export async function obtenirOperation(idOperation, idEntreprise) {
  const [rows] = await pool.query(
    `${SELECT_OPERATION} WHERE c.id_entreprise = ? AND o.id_operation = ?${GROUPE}`,
    [idEntreprise, idOperation]
  );
  // 404 : on ne révèle pas l'existence d'une opération d'une autre entreprise
  if (rows.length === 0) throw new HttpError(404, 'Opération introuvable.');

  const [reglements] = await pool.query(
    `SELECT r.id_facture, f.numero_facture, f.type_facture, f.montant_ttc,
            f.statut_facture, r.montant_affecte
       FROM regler r
       JOIN facture f ON f.id_facture = r.id_facture
      WHERE r.id_operation = ?
      ORDER BY f.date_emission, f.id_facture`,
    [idOperation]
  );
  return { ...rows[0], reglements };
}

// RG16 : le compte appartient à l'entreprise et n'est pas clôturé
async function verifierCompte(conn, idEntreprise, idCompte) {
  const [rows] = await conn.query(
    'SELECT statut_compte FROM compte WHERE id_compte = ? AND id_entreprise = ?',
    [idCompte, idEntreprise]
  );
  if (rows.length === 0) throw new HttpError(400, 'Compte introuvable dans votre entreprise.');
  if (rows[0].statut_compte !== 'actif') throw new HttpError(400, 'Ce compte est clôturé.');
}

// RG18 : un encaissement relève d'une catégorie de recette, un décaissement d'une catégorie de dépense
async function verifierCategorie(conn, idEntreprise, idCategorie, typeOperation) {
  const [rows] = await conn.query(
    'SELECT type_categorie FROM categorie WHERE id_categorie = ? AND id_entreprise = ?',
    [idCategorie, idEntreprise]
  );
  if (rows.length === 0) throw new HttpError(400, 'Catégorie introuvable dans votre entreprise.');
  const attendu = typeOperation === 'encaissement' ? 'recette' : 'depense';
  if (rows[0].type_categorie !== attendu) {
    throw new HttpError(
      400,
      typeOperation === 'encaissement'
        ? 'Un encaissement doit utiliser une catégorie de recette.'
        : 'Un décaissement doit utiliser une catégorie de dépense.'
    );
  }
}

// RG21 : le statut d'une facture se déduit de ses règlements
async function recalculerStatut(conn, idFacture) {
  const [[f]] = await conn.query(
    'SELECT montant_ttc, statut_facture FROM facture WHERE id_facture = ?',
    [idFacture]
  );
  if (!f || f.statut_facture === 'annulee') return;

  const [[{ regle }]] = await conn.query(
    'SELECT COALESCE(SUM(montant_affecte), 0) AS regle FROM regler WHERE id_facture = ?',
    [idFacture]
  );
  const paye = centiemes(regle);
  const statut = paye === 0n ? 'impayee' : paye >= centiemes(f.montant_ttc) ? 'payee' : 'partielle';
  if (statut !== f.statut_facture) {
    await conn.query('UPDATE facture SET statut_facture = ? WHERE id_facture = ?', [statut, idFacture]);
  }
}

// T7 : affecte une opération à une ou plusieurs factures (RG19, RG20, RG21)
async function affecter(conn, idEntreprise, op, reglements) {
  const [[{ deja }]] = await conn.query(
    'SELECT COALESCE(SUM(montant_affecte), 0) AS deja FROM regler WHERE id_operation = ?',
    [op.id_operation]
  );
  let totalOperation = centiemes(deja);
  const limiteOperation = centiemes(op.montant_operation);
  // un encaissement règle une facture de vente, un décaissement une facture d'achat
  const sensAttendu = op.type_operation === 'encaissement' ? 'vente' : 'achat';

  for (const r of reglements) {
    const [rows] = await conn.query(
      `SELECT id_facture, numero_facture, type_facture, montant_ttc, statut_facture
         FROM facture WHERE id_facture = ? AND id_entreprise = ? FOR UPDATE`,
      [r.id_facture, idEntreprise]
    );
    if (rows.length === 0) {
      throw new HttpError(400, `Facture ${r.id_facture} introuvable dans votre entreprise.`);
    }
    const f = rows[0];
    if (f.statut_facture === 'annulee') {
      throw new HttpError(400, `La facture ${f.numero_facture} est annulée.`);
    }
    if (f.type_facture !== sensAttendu) {
      throw new HttpError(
        400,
        sensAttendu === 'vente'
          ? `Un encaissement ne peut régler qu'une facture de vente (${f.numero_facture}).`
          : `Un décaissement ne peut régler qu'une facture d'achat (${f.numero_facture}).`
      );
    }

    const [[{ regle }]] = await conn.query(
      'SELECT COALESCE(SUM(montant_affecte), 0) AS regle FROM regler WHERE id_facture = ?',
      [f.id_facture]
    );
    const montant = centiemes(r.montant_affecte);
    if (centiemes(regle) + montant > centiemes(f.montant_ttc)) { // RG20
      throw new HttpError(400, `Le règlement dépasse le reste à payer de la facture ${f.numero_facture}.`);
    }
    totalOperation += montant;
    if (totalOperation > limiteOperation) {
      throw new HttpError(400, "La somme affectée aux factures dépasse le montant de l'opération.");
    }

    try {
      await conn.query(
        'INSERT INTO regler (id_operation, id_facture, montant_affecte) VALUES (?, ?, ?)',
        [op.id_operation, f.id_facture, r.montant_affecte]
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        throw new HttpError(409, `Cette opération règle déjà la facture ${f.numero_facture}.`);
      }
      throw err;
    }
    await recalculerStatut(conn, f.id_facture);
  }
}

// Verrouille l'opération (l'entreprise est déduite de son compte)
async function verrouillerOperation(conn, idOperation, idEntreprise) {
  const [rows] = await conn.query(
    `SELECT o.id_operation, o.type_operation, o.montant_operation
       FROM operation o
       JOIN compte c ON c.id_compte = o.id_compte
      WHERE o.id_operation = ? AND c.id_entreprise = ?
      FOR UPDATE`,
    [idOperation, idEntreprise]
  );
  if (rows.length === 0) throw new HttpError(404, 'Opération introuvable.');
  return rows[0];
}

async function executer(travail) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const resultat = await travail(conn);
    await conn.commit();
    return resultat;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// T6 et T7 : l'opération et ses règlements éventuels sont enregistrés ensemble
export async function creerOperation(idEntreprise, idUtilisateur, d) {
  const idOperation = await executer(async (conn) => {
    await verifierCompte(conn, idEntreprise, d.id_compte);
    await verifierCategorie(conn, idEntreprise, d.id_categorie, d.type_operation);

    const [r] = await conn.query(
      `INSERT INTO operation
        (date_operation, type_operation, montant_operation, mode_paiement,
         reference_operation, libelle_operation, id_compte, id_categorie, id_utilisateur)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        d.date_operation, d.type_operation, d.montant_operation, d.mode_paiement,
        d.reference_operation, d.libelle_operation, d.id_compte, d.id_categorie, idUtilisateur,
      ]
    );
    if (d.reglements.length > 0) {
      await affecter(
        conn, idEntreprise,
        { id_operation: r.insertId, type_operation: d.type_operation, montant_operation: d.montant_operation },
        d.reglements
      );
    }
    return r.insertId;
  });
  return obtenirOperation(idOperation, idEntreprise);
}

export async function ajouterReglements(idOperation, idEntreprise, reglements) {
  await executer(async (conn) => {
    const op = await verrouillerOperation(conn, idOperation, idEntreprise);
    await affecter(conn, idEntreprise, op, reglements);
  });
  return obtenirOperation(idOperation, idEntreprise);
}

export async function retirerReglement(idOperation, idFacture, idEntreprise) {
  await executer(async (conn) => {
    await verrouillerOperation(conn, idOperation, idEntreprise);
    await conn.query('SELECT id_facture FROM facture WHERE id_facture = ? FOR UPDATE', [idFacture]);
    const [r] = await conn.query('DELETE FROM regler WHERE id_operation = ? AND id_facture = ?', [
      idOperation,
      idFacture,
    ]);
    if (r.affectedRows === 0) throw new HttpError(404, 'Règlement introuvable.');
    await recalculerStatut(conn, idFacture);
  });
  return obtenirOperation(idOperation, idEntreprise);
}

// Modifiable seulement sans règlement : sinon les montants des factures seraient faussés
export async function modifierOperation(idOperation, idEntreprise, d) {
  await executer(async (conn) => {
    await verrouillerOperation(conn, idOperation, idEntreprise);
    const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM regler WHERE id_operation = ?', [
      idOperation,
    ]);
    if (n > 0) {
      throw new HttpError(409, 'Cette opération a des règlements : retirez-les avant de la modifier.');
    }
    await verifierCompte(conn, idEntreprise, d.id_compte);
    await verifierCategorie(conn, idEntreprise, d.id_categorie, d.type_operation);

    await conn.query(
      `UPDATE operation
          SET date_operation = ?, type_operation = ?, montant_operation = ?, mode_paiement = ?,
              reference_operation = ?, libelle_operation = ?, id_compte = ?, id_categorie = ?
        WHERE id_operation = ?`,
      [
        d.date_operation, d.type_operation, d.montant_operation, d.mode_paiement,
        d.reference_operation, d.libelle_operation, d.id_compte, d.id_categorie, idOperation,
      ]
    );
  });
  return obtenirOperation(idOperation, idEntreprise);
}

// La suppression libère les factures réglées : leur statut est recalculé
export async function supprimerOperation(idOperation, idEntreprise) {
  await executer(async (conn) => {
    await verrouillerOperation(conn, idOperation, idEntreprise);
    const [liens] = await conn.query('SELECT id_facture FROM regler WHERE id_operation = ?', [idOperation]);
    await conn.query('DELETE FROM regler WHERE id_operation = ?', [idOperation]);
    await conn.query('DELETE FROM operation WHERE id_operation = ?', [idOperation]);
    for (const { id_facture } of liens) await recalculerStatut(conn, id_facture);
  });
}
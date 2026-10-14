import { pool } from '../config/db.js';
import { HttpError } from '../utils/httpError.js';
import { centiemes, enMontant } from '../utils/calculs.js';

// Rien n'est stocké pour le tableau de bord : tout est calculé à la demande,
// et chaque requête est restreinte à l'entreprise de l'utilisateur (RG6).

// Factures de l'entreprise non soldées, avec leur reste à payer
const FACTURES_OUVERTES = `
  SELECT f.id_facture, f.numero_facture, f.type_facture, f.date_echeance, f.id_tiers,
         f.montant_ttc - COALESCE(SUM(r.montant_affecte), 0) AS reste
    FROM facture f
    LEFT JOIN regler r ON r.id_facture = f.id_facture
   WHERE f.id_entreprise = ? AND f.statut_facture IN ('impayee', 'partielle')
   GROUP BY f.id_facture, f.numero_facture, f.type_facture, f.date_echeance, f.id_tiers, f.montant_ttc`;

export function sixDerniersMois(debutMois) {
  let [annee, mois] = debutMois.slice(0, 7).split('-').map(Number);
  const liste = [];
  for (let i = 0; i < 6; i += 1) {
    liste.unshift(`${annee}-${String(mois).padStart(2, '0')}`);
    mois -= 1;
    if (mois === 0) {
      mois = 12;
      annee -= 1;
    }
  }
  return liste;
}

async function echeances(idEntreprise, condition, parametres) {
  const [rows] = await pool.query(
    `SELECT x.id_facture, x.numero_facture, x.type_facture, t.nom_tiers,
            x.date_echeance, x.reste AS reste_a_payer
       FROM (${FACTURES_OUVERTES}) x
       JOIN tiers t ON t.id_tiers = x.id_tiers
      WHERE ${condition}
      ORDER BY x.date_echeance, x.id_facture
      LIMIT 10`,
    [idEntreprise, ...parametres]
  );
  return rows;
}

export async function tableauDeBord(idEntreprise, { du, au, jours }) {
  const [[dates]] = await pool.query(
    "SELECT DATE_FORMAT(CURDATE(), '%Y-%m-01') AS debut_mois, CURDATE() AS aujourdhui"
  );
  const debut = du ?? (au && au < dates.debut_mois ? au : dates.debut_mois);
  const fin = au ?? (du && du > dates.aujourdhui ? du : dates.aujourdhui);
  if (debut > fin) throw new HttpError(400, 'La date de début doit précéder la date de fin.');

  const [
    [comptes],
    [[flux]],
    [parCategorie],
    [evolutionBrute],
    [ouvertes],
    aVenir,
    enRetard,
  ] = await Promise.all([
    pool.query(
      `SELECT c.id_compte, c.nom_compte, c.type_compte,
              c.solde_initial + COALESCE(SUM(CASE o.type_operation
                  WHEN 'encaissement' THEN o.montant_operation
                  WHEN 'decaissement' THEN -o.montant_operation
              END), 0) AS solde_actuel
         FROM compte c
         LEFT JOIN operation o ON o.id_compte = c.id_compte
        WHERE c.id_entreprise = ? AND c.statut_compte = 'actif'
        GROUP BY c.id_compte, c.nom_compte, c.type_compte, c.solde_initial
        ORDER BY c.nom_compte`,
      [idEntreprise]
    ),
    pool.query(
      `SELECT COALESCE(SUM(CASE WHEN o.type_operation = 'encaissement' THEN o.montant_operation END), 0) AS encaissements,
              COALESCE(SUM(CASE WHEN o.type_operation = 'decaissement' THEN o.montant_operation END), 0) AS decaissements
         FROM operation o
         JOIN compte c ON c.id_compte = o.id_compte
        WHERE c.id_entreprise = ? AND o.date_operation BETWEEN ? AND ?`,
      [idEntreprise, debut, fin]
    ),
    pool.query(
      `SELECT k.libelle_categorie, k.type_categorie, SUM(o.montant_operation) AS total
         FROM operation o
         JOIN compte c ON c.id_compte = o.id_compte
         JOIN categorie k ON k.id_categorie = o.id_categorie
        WHERE c.id_entreprise = ? AND o.date_operation BETWEEN ? AND ?
        GROUP BY k.id_categorie, k.libelle_categorie, k.type_categorie
        ORDER BY total DESC`,
      [idEntreprise, debut, fin]
    ),
    pool.query(
      `SELECT DATE_FORMAT(o.date_operation, '%Y-%m') AS mois,
              COALESCE(SUM(CASE WHEN o.type_operation = 'encaissement' THEN o.montant_operation END), 0) AS encaissements,
              COALESCE(SUM(CASE WHEN o.type_operation = 'decaissement' THEN o.montant_operation END), 0) AS decaissements
         FROM operation o
         JOIN compte c ON c.id_compte = o.id_compte
        WHERE c.id_entreprise = ?
          AND o.date_operation >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 5 MONTH)
        GROUP BY DATE_FORMAT(o.date_operation, '%Y-%m')
        ORDER BY mois`,
      [idEntreprise]
    ),
    pool.query(
      `SELECT x.type_facture,
              COUNT(*) AS nombre,
              COALESCE(SUM(x.reste), 0) AS total,
              COALESCE(SUM(CASE WHEN x.date_echeance < CURDATE() THEN x.reste ELSE 0 END), 0) AS en_retard,
              COALESCE(SUM(CASE WHEN x.date_echeance <= DATE_ADD(CURDATE(), INTERVAL ? DAY) THEN x.reste ELSE 0 END), 0) AS a_echeance
         FROM (${FACTURES_OUVERTES}) x
        GROUP BY x.type_facture`,
      [jours, idEntreprise]
    ),
    echeances(
      idEntreprise,
      'x.date_echeance >= CURDATE() AND x.date_echeance <= DATE_ADD(CURDATE(), INTERVAL ? DAY)',
      [jours]
    ),
    echeances(idEntreprise, 'x.date_echeance < CURDATE()', []),
  ]);

  // Soldes : total consolidé des comptes actifs, calculé sans flottants
  const soldeTotal = comptes.reduce((s, c) => s + centiemes(c.solde_actuel), 0n);

  // Flux de la période
  const enc = centiemes(flux.encaissements);
  const dec = centiemes(flux.decaissements);

  // Évolution : les six derniers mois, y compris ceux sans opération
  const parMois = new Map(evolutionBrute.map((m) => [m.mois, m]));
  const evolution = sixDerniersMois(dates.debut_mois).map((mois) => ({
    mois,
    encaissements: parMois.get(mois)?.encaissements ?? '0.00',
    decaissements: parMois.get(mois)?.decaissements ?? '0.00',
  }));

  // Créances (factures de vente) et dettes (factures d'achat)
  const vide = { nombre: 0, total: '0.00', en_retard: '0.00', a_echeance: '0.00' };
  const creances = ouvertes.find((o) => o.type_facture === 'vente') ?? vide;
  const dettes = ouvertes.find((o) => o.type_facture === 'achat') ?? vide;

  // Prévision : solde actuel + créances échues ou à échoir - dettes échues ou à échoir.
  // Hypothèse : toutes les factures arrivées à échéance sont réglées à temps.
  const entrees = centiemes(creances.a_echeance);
  const sorties = centiemes(dettes.a_echeance);

  return {
    periode: { du: debut, au: fin },
    soldes: {
      total: enMontant(soldeTotal),
      comptes: comptes.map((c) => ({ ...c, solde_actuel: enMontant(centiemes(c.solde_actuel)) })),
    },
    flux: {
      encaissements: enMontant(enc),
      decaissements: enMontant(dec),
      net: enMontant(enc - dec),
    },
    par_categorie: parCategorie,
    evolution,
    creances: { nombre: creances.nombre, total: creances.total, en_retard: creances.en_retard },
    dettes: { nombre: dettes.nombre, total: dettes.total, en_retard: dettes.en_retard },
    echeances: { a_venir: aVenir, en_retard: enRetard },
    prevision: {
      jours,
      solde_actuel: enMontant(soldeTotal),
      entrees_prevues: enMontant(entrees),
      sorties_prevues: enMontant(sorties),
      solde_previsionnel: enMontant(soldeTotal + entrees - sorties),
    },
  };
}
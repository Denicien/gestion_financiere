import { pool } from '../config/db.js';
import { HttpError } from '../utils/httpError.js';
import { hasher } from '../utils/password.js';
import { ROLES } from '../utils/roles.js';
import { emailExiste, idDuRole } from './auth.service.js';

const SELECT_UTILISATEUR = `
  SELECT u.id_utilisateur, u.nom_utilisateur, u.prenom_utilisateur, u.email_utilisateur,
         u.statut_utilisateur, u.date_creation_utilisateur, r.libelle_role AS role
    FROM utilisateur u
    JOIN role r ON r.id_role = u.id_role`;

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

// RG6 : un utilisateur d'une autre entreprise est traité comme inexistant (404)
export async function obtenirUtilisateur(idUtilisateur, idEntreprise) {
  const [rows] = await pool.query(
    `${SELECT_UTILISATEUR} WHERE u.id_utilisateur = ? AND u.id_entreprise = ?`,
    [idUtilisateur, idEntreprise]
  );
  if (rows.length === 0) throw new HttpError(404, 'Utilisateur introuvable.');
  return rows[0];
}

// T3 : création d'un utilisateur dans l'entreprise de l'administrateur (RG2, RG4, RG5)
export async function creerUtilisateur(idEntreprise, d) {
  const conn = await pool.getConnection();
  try {
    if (await emailExiste(conn, d.email)) {
      throw new HttpError(409, 'Cette adresse e-mail est déjà utilisée.');
    }
    const roleId = await idDuRole(conn, d.role);
    const hash = await hasher(d.mot_de_passe);

    const [r] = await conn.query(
      `INSERT INTO utilisateur
        (nom_utilisateur, prenom_utilisateur, email_utilisateur, mot_de_passe, id_entreprise, id_role)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [d.nom_utilisateur, d.prenom_utilisateur, d.email, hash, idEntreprise, roleId]
    );
    return obtenirUtilisateur(r.insertId, idEntreprise);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new HttpError(409, 'Cette adresse e-mail est déjà utilisée.');
    }
    throw err;
  } finally {
    conn.release();
  }
}

// RG6 : seuls les utilisateurs de l'entreprise sont listés, sans le mot de passe
export async function listerUtilisateurs(idEntreprise) {
  const [rows] = await pool.query(
    `${SELECT_UTILISATEUR} WHERE u.id_entreprise = ? ORDER BY u.nom_utilisateur, u.prenom_utilisateur`,
    [idEntreprise]
  );
  return rows;
}

// Verrouille la ligne de l'utilisateur ciblé pour la durée de la transaction
async function verrouillerCible(conn, idUtilisateur, idEntreprise) {
  const [rows] = await conn.query(
    `${SELECT_UTILISATEUR} WHERE u.id_utilisateur = ? AND u.id_entreprise = ? FOR UPDATE`,
    [idUtilisateur, idEntreprise]
  );
  if (rows.length === 0) throw new HttpError(404, 'Utilisateur introuvable.');
  return rows[0];
}

// Verrouille et compte les administrateurs actifs : deux modifications simultanées
// ne peuvent donc pas laisser l'entreprise sans administrateur.
async function compterAdministrateursActifs(conn, idEntreprise) {
  const [rows] = await conn.query(
    `SELECT u.id_utilisateur
       FROM utilisateur u
       JOIN role r ON r.id_role = u.id_role
      WHERE u.id_entreprise = ? AND r.libelle_role = ? AND u.statut_utilisateur = 'actif'
      FOR UPDATE`,
    [idEntreprise, ROLES.ADMIN]
  );
  return rows.length;
}

const MESSAGE_DERNIER_ADMIN = "L'entreprise doit garder au moins un administrateur actif.";

export async function changerRole(idEntreprise, idActeur, idCible, nouveauRole) {
  await executer(async (conn) => {
    const cible = await verrouillerCible(conn, idCible, idEntreprise);

    if (cible.id_utilisateur === idActeur) {
      throw new HttpError(409, 'Vous ne pouvez pas modifier votre propre rôle.');
    }
    if (cible.role === nouveauRole) return;

    const retireAdmin = cible.role === ROLES.ADMIN && cible.statut_utilisateur === 'actif';
    if (retireAdmin && (await compterAdministrateursActifs(conn, idEntreprise)) <= 1) {
      throw new HttpError(409, MESSAGE_DERNIER_ADMIN);
    }

    const roleId = await idDuRole(conn, nouveauRole);
    await conn.query('UPDATE utilisateur SET id_role = ? WHERE id_utilisateur = ? AND id_entreprise = ?', [
      roleId, idCible, idEntreprise,
    ]);
  });
  return obtenirUtilisateur(idCible, idEntreprise);
}

// RG22 : un utilisateur ne se supprime pas, il se désactive. Il perd l'accès immédiatement.
export async function changerStatut(idEntreprise, idActeur, idCible, statut) {
  await executer(async (conn) => {
    const cible = await verrouillerCible(conn, idCible, idEntreprise);

    if (statut === 'desactive' && cible.id_utilisateur === idActeur) {
      throw new HttpError(409, 'Vous ne pouvez pas désactiver votre propre compte.');
    }
    if (cible.statut_utilisateur === statut) return;

    const desactiveAdmin =
      statut === 'desactive' && cible.role === ROLES.ADMIN && cible.statut_utilisateur === 'actif';
    if (desactiveAdmin && (await compterAdministrateursActifs(conn, idEntreprise)) <= 1) {
      throw new HttpError(409, MESSAGE_DERNIER_ADMIN);
    }

    await conn.query(
      'UPDATE utilisateur SET statut_utilisateur = ? WHERE id_utilisateur = ? AND id_entreprise = ?',
      [statut, idCible, idEntreprise]
    );
  });
  return obtenirUtilisateur(idCible, idEntreprise);
}

export async function reinitialiserMotDePasse(idEntreprise, idCible, motDePasse) {
  await obtenirUtilisateur(idCible, idEntreprise); // 404 si l'utilisateur n'est pas de l'entreprise
  const hash = await hasher(motDePasse);
  await pool.query('UPDATE utilisateur SET mot_de_passe = ? WHERE id_utilisateur = ? AND id_entreprise = ?', [
    hash, idCible, idEntreprise,
  ]);
}
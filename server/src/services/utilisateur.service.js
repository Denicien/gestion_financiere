import { pool } from '../config/db.js';
import { HttpError } from '../utils/httpError.js';
import { hasher } from '../utils/password.js';
import { emailExiste, idDuRole } from './auth.service.js';

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
    return {
      id_utilisateur: r.insertId,
      nom_utilisateur: d.nom_utilisateur,
      prenom_utilisateur: d.prenom_utilisateur,
      email_utilisateur: d.email,
      role: d.role,
      statut_utilisateur: 'actif',
    };
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
    `SELECT u.id_utilisateur, u.nom_utilisateur, u.prenom_utilisateur,
            u.email_utilisateur, u.statut_utilisateur, u.date_creation_utilisateur,
            r.libelle_role AS role
       FROM utilisateur u
       JOIN role r ON r.id_role = u.id_role
      WHERE u.id_entreprise = ?
      ORDER BY u.nom_utilisateur`,
    [idEntreprise]
  );
  return rows;
}

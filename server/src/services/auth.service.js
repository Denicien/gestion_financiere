import { pool } from '../config/db.js';
import { HttpError } from '../utils/httpError.js';
import { hasher, verifier, HASH_FACTICE } from '../utils/password.js';
import { signerToken } from '../utils/jwt.js';
import { ROLES } from '../utils/roles.js';
import { creerDonneesParDefaut } from './defaut.service.js';

function construireSession(u) {
  const token = signerToken({ id_utilisateur: u.id_utilisateur });
  return {
    token,
    utilisateur: {
      id_utilisateur: u.id_utilisateur,
      nom_utilisateur: u.nom_utilisateur,
      prenom_utilisateur: u.prenom_utilisateur,
      email_utilisateur: u.email_utilisateur,
      role: u.libelle_role,
      id_entreprise: u.id_entreprise,
    },
  };
}

export async function emailExiste(conn, email) {
  const [rows] = await conn.query(
    'SELECT 1 FROM utilisateur WHERE email_utilisateur = ? LIMIT 1',
    [email]
  );
  return rows.length > 0;
}

export async function idDuRole(conn, libelle) {
  const [rows] = await conn.query('SELECT id_role FROM role WHERE libelle_role = ?', [libelle]);
  if (rows.length === 0) throw new HttpError(500, `Rôle « ${libelle} » introuvable en base.`);
  return rows[0].id_role;
}

// T1 : inscription d'une entreprise et de son administrateur (RG1, RG3, RG5)
export async function inscrireEntreprise(d) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (await emailExiste(conn, d.email)) {
      throw new HttpError(409, 'Cette adresse e-mail est déjà utilisée.');
    }
    const roleId = await idDuRole(conn, ROLES.ADMIN);

    const [e] = await conn.query(
      `INSERT INTO entreprise
        (nom_entreprise, nif_entreprise, stat_entreprise, adresse_entreprise,
         telephone_entreprise, email_entreprise, assujetti_tva, taux_tva)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        d.nom_entreprise, d.nif_entreprise, d.stat_entreprise, d.adresse_entreprise,
        d.telephone_entreprise, d.email_entreprise, d.assujetti_tva ? 1 : 0, d.taux_tva,
      ]
    );

    const hash = await hasher(d.mot_de_passe);
    const [u] = await conn.query(
      `INSERT INTO utilisateur
        (nom_utilisateur, prenom_utilisateur, email_utilisateur, mot_de_passe, id_entreprise, id_role)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [d.nom_utilisateur, d.prenom_utilisateur, d.email, hash, e.insertId, roleId]
    );

    await creerDonneesParDefaut(conn, e.insertId);

    await conn.commit();
    return construireSession({
      id_utilisateur: u.insertId,
      nom_utilisateur: d.nom_utilisateur,
      prenom_utilisateur: d.prenom_utilisateur,
      email_utilisateur: d.email,
      libelle_role: ROLES.ADMIN,
      id_entreprise: e.insertId,
    });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      throw new HttpError(409, 'Cette adresse e-mail est déjà utilisée.');
    }
    throw err;
  } finally {
    conn.release();
  }
}

// T2 : authentification
export async function connecter(email, motDePasse) {
  const [rows] = await pool.query(
    `SELECT u.id_utilisateur, u.nom_utilisateur, u.prenom_utilisateur,
            u.email_utilisateur, u.mot_de_passe, u.statut_utilisateur,
            u.id_entreprise, r.libelle_role
       FROM utilisateur u
       JOIN role r ON r.id_role = u.id_role
      WHERE u.email_utilisateur = ?`,
    [email]
  );
  const u = rows[0];

  const motDePasseOk = await verifier(motDePasse, u ? u.mot_de_passe : HASH_FACTICE);
  if (!u || !motDePasseOk) throw new HttpError(401, 'E-mail ou mot de passe incorrect.');
  if (u.statut_utilisateur !== 'actif') throw new HttpError(403, 'Ce compte est désactivé.');

  return construireSession(u);
}

// Profil de l'utilisateur connecté, avec les paramètres de son entreprise
export async function profil(idUtilisateur) {
  const [rows] = await pool.query(
    `SELECT u.id_utilisateur, u.nom_utilisateur, u.prenom_utilisateur,
            u.email_utilisateur, r.libelle_role AS role,
            e.id_entreprise, e.nom_entreprise, e.assujetti_tva, e.taux_tva
       FROM utilisateur u
       JOIN role r ON r.id_role = u.id_role
       JOIN entreprise e ON e.id_entreprise = u.id_entreprise
      WHERE u.id_utilisateur = ?`,
    [idUtilisateur]
  );
  if (rows.length === 0) throw new HttpError(404, 'Utilisateur introuvable.');
  return { ...rows[0], assujetti_tva: Boolean(rows[0].assujetti_tva) };
}

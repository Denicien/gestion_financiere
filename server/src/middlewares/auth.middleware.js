import { pool } from '../config/db.js';
import { HttpError } from '../utils/httpError.js';
import { verifierToken } from '../utils/jwt.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Vérifie le jeton, puis relit l'utilisateur en base : l'entreprise, le rôle et
// le statut viennent toujours de la base, jamais du client (RG6). Un compte
// désactivé perd donc l'accès immédiatement.
export const authentifier = asyncHandler(async (req, res, next) => {
  const entete = req.headers.authorization || '';
  const [type, token] = entete.split(' ');
  if (type !== 'Bearer' || !token) throw new HttpError(401, 'Authentification requise.');

  let payload;
  try {
    payload = verifierToken(token);
  } catch {
    throw new HttpError(401, 'Session invalide ou expirée.');
  }

  const [rows] = await pool.query(
    `SELECT u.id_utilisateur, u.id_entreprise, u.statut_utilisateur, r.libelle_role AS role
       FROM utilisateur u
       JOIN role r ON r.id_role = u.id_role
      WHERE u.id_utilisateur = ?`,
    [payload.id_utilisateur]
  );
  const u = rows[0];
  if (!u || u.statut_utilisateur !== 'actif') {
    throw new HttpError(401, 'Compte introuvable ou désactivé.');
  }

  req.user = { id_utilisateur: u.id_utilisateur, id_entreprise: u.id_entreprise, role: u.role };
  next();
});

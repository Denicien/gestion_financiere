import { HttpError } from '../utils/httpError.js';

export function notFound(req, res, next) {
  next(new HttpError(404, 'Route introuvable.'));
}

// Dernier middleware : aucune trace technique n'est renvoyée au client
export function gestionErreurs(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ erreur: err.message });
  }
  if (err instanceof SyntaxError && err.status === 400) {
    return res.status(400).json({ erreur: 'Corps de requête JSON invalide.' });
  }
  console.error(err);
  res.status(500).json({ erreur: 'Erreur interne du serveur.' });
}

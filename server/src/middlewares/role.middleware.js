import { HttpError } from '../utils/httpError.js';

// Applique la matrice des permissions (tableau 10), route par route
export const autoriser = (...rolesAutorises) => (req, res, next) => {
  if (!req.user || !rolesAutorises.includes(req.user.role)) {
    return next(new HttpError(403, "Vous n'avez pas le droit d'effectuer cette action."));
  }
  next();
};

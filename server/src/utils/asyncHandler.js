// Transmet les erreurs des fonctions asynchrones au middleware d'erreurs
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

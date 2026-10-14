import { asyncHandler } from '../utils/asyncHandler.js';
import { dateIso } from '../utils/validation.js';
import { tableauDeBord } from '../services/dashboard.service.js';

// T8 : consultation du tableau de bord. Paramètres facultatifs :
//   du, au  : période des flux (par défaut, du début du mois à aujourd'hui)
//   jours   : horizon des échéances et de la prévision (30 par défaut, 365 au plus)
export const consulter = asyncHandler(async (req, res) => {
  const q = req.query;
  const jours = Math.min(365, Math.max(1, parseInt(q.jours, 10) || 30));
  res.json(
    await tableauDeBord(req.user.id_entreprise, {
      du: q.du !== undefined ? dateIso(q.du, 'du') : undefined,
      au: q.au !== undefined ? dateIso(q.au, 'au') : undefined,
      jours,
    })
  );
});
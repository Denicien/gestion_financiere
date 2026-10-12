import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import {
  texteRequis, texteOptionnel, emailValide, motDePasseValide, tauxTva,
} from '../utils/validation.js';
import { inscrireEntreprise, connecter, profil } from '../services/auth.service.js';

export const inscription = asyncHandler(async (req, res) => {
  const b = req.body ?? {};
  const assujetti = b.assujetti_tva === true || b.assujetti_tva === 'true';

  const data = {
    nom_entreprise: texteRequis(b.nom_entreprise, "nom de l'entreprise", 100),
    nif_entreprise: texteOptionnel(b.nif_entreprise, 'NIF', 20),
    stat_entreprise: texteOptionnel(b.stat_entreprise, 'numéro statistique', 20),
    adresse_entreprise: texteOptionnel(b.adresse_entreprise, 'adresse', 150),
    telephone_entreprise: texteOptionnel(b.telephone_entreprise, 'téléphone', 20),
    email_entreprise: texteOptionnel(b.email_entreprise, "e-mail de l'entreprise", 100),
    assujetti_tva: assujetti,
    taux_tva: tauxTva(assujetti, b.taux_tva),
    nom_utilisateur: texteRequis(b.nom_utilisateur, 'nom', 60),
    prenom_utilisateur: texteOptionnel(b.prenom_utilisateur, 'prénom', 60),
    email: emailValide(b.email_utilisateur),
    mot_de_passe: motDePasseValide(b.mot_de_passe),
  };

  const session = await inscrireEntreprise(data);
  res.status(201).json(session);
});

export const connexion = asyncHandler(async (req, res) => {
  const b = req.body ?? {};
  if (typeof b.email_utilisateur !== 'string' || typeof b.mot_de_passe !== 'string') {
    throw new HttpError(400, 'E-mail et mot de passe obligatoires.');
  }
  const session = await connecter(b.email_utilisateur.trim().toLowerCase(), b.mot_de_passe);
  res.json(session);
});

export const moi = asyncHandler(async (req, res) => {
  res.json(await profil(req.user.id_utilisateur));
});

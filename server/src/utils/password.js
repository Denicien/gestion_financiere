import bcrypt from 'bcryptjs';

const ROUNDS = 10;

export const hasher = (motDePasse) => bcrypt.hash(motDePasse, ROUNDS);
export const verifier = (motDePasse, hash) => bcrypt.compare(motDePasse, hash);

// Hash factice : permet de faire la même comparaison quand l'e-mail n'existe
// pas, pour ne pas révéler par le temps de réponse si un compte existe.
export const HASH_FACTICE = bcrypt.hashSync('mot-de-passe-factice', ROUNDS);

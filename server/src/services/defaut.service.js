// Données créées automatiquement à l'inscription d'une entreprise, pour qu'elle puisse
// saisir des opérations immédiatement. Elles restent modifiables et supprimables.
const CATEGORIES = [
  ['Ventes', 'recette'],
  ['Autres recettes', 'recette'],
  ['Achats', 'depense'],
  ['Salaires', 'depense'],
  ['Loyer et charges', 'depense'],
  ['Transport', 'depense'],
  ['Impôts et taxes', 'depense'],
  ['Autres dépenses', 'depense'],
];

export async function creerDonneesParDefaut(conn, idEntreprise) {
  await conn.query(
    'INSERT INTO categorie (libelle_categorie, type_categorie, id_entreprise) VALUES ?',
    [CATEGORIES.map(([libelle, type]) => [libelle, type, idEntreprise])]
  );
  await conn.query(
    "INSERT INTO compte (nom_compte, type_compte, solde_initial, id_entreprise) VALUES ('Caisse', 'caisse', 0, ?)",
    [idEntreprise]
  );
}



DROP DATABASE IF EXISTS gestion_financiere;
CREATE DATABASE gestion_financiere
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;
USE gestion_financiere;

-- ---------------------------------------------------------------------
-- ENTREPRISE
-- ---------------------------------------------------------------------
CREATE TABLE entreprise (
    id_entreprise        INT AUTO_INCREMENT PRIMARY KEY,
    nom_entreprise       VARCHAR(100) NOT NULL,
    nif_entreprise       VARCHAR(20),
    stat_entreprise      VARCHAR(20),
    adresse_entreprise   VARCHAR(150),
    telephone_entreprise VARCHAR(20),
    email_entreprise     VARCHAR(100),
    assujetti_tva        BOOLEAN NOT NULL DEFAULT FALSE,
    taux_tva             DECIMAL(5,2),
    date_inscription     DATE NOT NULL DEFAULT (CURRENT_DATE),
    -- RG7 : un taux est obligatoire si l'entreprise est assujettie
    CONSTRAINT ck_entreprise_tva CHECK (
        (assujetti_tva = FALSE)
        OR (assujetti_tva = TRUE AND taux_tva IS NOT NULL AND taux_tva >= 0)
    )
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- ROLE
-- ---------------------------------------------------------------------
CREATE TABLE role (
    id_role      INT AUTO_INCREMENT PRIMARY KEY,
    libelle_role VARCHAR(30) NOT NULL UNIQUE
) ENGINE=InnoDB;

INSERT INTO role (libelle_role) VALUES
    ('Administrateur'),
    ('Comptable'),
    ('Gérant');

-- ---------------------------------------------------------------------
-- UTILISATEUR (RG2, RG5)
-- ---------------------------------------------------------------------
CREATE TABLE utilisateur (
    id_utilisateur            INT AUTO_INCREMENT PRIMARY KEY,
    nom_utilisateur           VARCHAR(60) NOT NULL,
    prenom_utilisateur        VARCHAR(60),
    email_utilisateur         VARCHAR(100) NOT NULL UNIQUE,
    mot_de_passe              VARCHAR(255) NOT NULL,
    statut_utilisateur        ENUM('actif','desactive') NOT NULL DEFAULT 'actif',
    date_creation_utilisateur DATE NOT NULL DEFAULT (CURRENT_DATE),
    id_entreprise             INT NOT NULL,
    id_role                   INT NOT NULL,
    CONSTRAINT fk_utilisateur_entreprise
        FOREIGN KEY (id_entreprise) REFERENCES entreprise(id_entreprise),
    CONSTRAINT fk_utilisateur_role
        FOREIGN KEY (id_role) REFERENCES role(id_role)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- TIERS (clients et fournisseurs) (RG9)
-- ---------------------------------------------------------------------
CREATE TABLE tiers (
    id_tiers         INT AUTO_INCREMENT PRIMARY KEY,
    nom_tiers        VARCHAR(100) NOT NULL,
    type_tiers       ENUM('client','fournisseur','les_deux') NOT NULL,
    nif_tiers        VARCHAR(20),
    adresse_tiers    VARCHAR(150),
    telephone_tiers  VARCHAR(20),
    email_tiers      VARCHAR(100),
    id_entreprise    INT NOT NULL,
    CONSTRAINT fk_tiers_entreprise
        FOREIGN KEY (id_entreprise) REFERENCES entreprise(id_entreprise)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- FACTURE (RG10 à RG14)
-- id_entreprise est ajouté pour garantir l'unicité du numéro par
-- entreprise (RG12) et faciliter le filtrage multi-entreprises.
-- ---------------------------------------------------------------------
CREATE TABLE facture (
    id_facture     INT AUTO_INCREMENT PRIMARY KEY,
    numero_facture VARCHAR(30) NOT NULL,
    type_facture   ENUM('vente','achat') NOT NULL,
    date_emission  DATE NOT NULL,
    date_echeance  DATE NOT NULL,
    montant_ht     DECIMAL(15,2) NOT NULL DEFAULT 0,
    montant_tva    DECIMAL(15,2) NOT NULL DEFAULT 0,
    montant_ttc    DECIMAL(15,2) NOT NULL DEFAULT 0,
    statut_facture ENUM('impayee','partielle','payee','annulee')
                   NOT NULL DEFAULT 'impayee',
    id_tiers       INT NOT NULL,
    id_entreprise  INT NOT NULL,
    CONSTRAINT uq_facture_numero UNIQUE (id_entreprise, numero_facture),
    CONSTRAINT ck_facture_dates   CHECK (date_echeance >= date_emission),
    CONSTRAINT ck_facture_montants CHECK (
        montant_ht >= 0 AND montant_tva >= 0
        AND montant_ttc = montant_ht + montant_tva
    ),
    CONSTRAINT fk_facture_tiers
        FOREIGN KEY (id_tiers) REFERENCES tiers(id_tiers),
    CONSTRAINT fk_facture_entreprise
        FOREIGN KEY (id_entreprise) REFERENCES entreprise(id_entreprise)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- LIGNE_FACTURE
-- ---------------------------------------------------------------------
CREATE TABLE ligne_facture (
    id_ligne         INT AUTO_INCREMENT PRIMARY KEY,
    designation_ligne VARCHAR(150) NOT NULL,
    quantite         DECIMAL(10,2) NOT NULL,
    prix_unitaire_ht DECIMAL(15,2) NOT NULL,
    id_facture       INT NOT NULL,
    CONSTRAINT ck_ligne_quantite CHECK (quantite > 0),
    CONSTRAINT ck_ligne_prix     CHECK (prix_unitaire_ht >= 0),
    CONSTRAINT fk_ligne_facture
        FOREIGN KEY (id_facture) REFERENCES facture(id_facture)
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- COMPTE (banque, caisse, mobile money) (RG15)
-- ---------------------------------------------------------------------
CREATE TABLE compte (
    id_compte      INT AUTO_INCREMENT PRIMARY KEY,
    nom_compte     VARCHAR(80) NOT NULL,
    type_compte    ENUM('banque','caisse','mobile_money') NOT NULL,
    numero_compte  VARCHAR(40),
    solde_initial  DECIMAL(15,2) NOT NULL DEFAULT 0,
    statut_compte  ENUM('actif','cloture') NOT NULL DEFAULT 'actif',
    id_entreprise  INT NOT NULL,
    CONSTRAINT fk_compte_entreprise
        FOREIGN KEY (id_entreprise) REFERENCES entreprise(id_entreprise)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- CATEGORIE (RG18)
-- ---------------------------------------------------------------------
CREATE TABLE categorie (
    id_categorie      INT AUTO_INCREMENT PRIMARY KEY,
    libelle_categorie VARCHAR(80) NOT NULL,
    type_categorie    ENUM('recette','depense') NOT NULL,
    id_entreprise     INT NOT NULL,
    CONSTRAINT fk_categorie_entreprise
        FOREIGN KEY (id_entreprise) REFERENCES entreprise(id_entreprise)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- OPERATION (RG16, RG17)
-- ---------------------------------------------------------------------
CREATE TABLE operation (
    id_operation        INT AUTO_INCREMENT PRIMARY KEY,
    date_operation      DATE NOT NULL,
    type_operation      ENUM('encaissement','decaissement') NOT NULL,
    montant_operation   DECIMAL(15,2) NOT NULL,
    mode_paiement       ENUM('especes','cheque','virement','mobile_money') NOT NULL,
    reference_operation VARCHAR(50),
    libelle_operation   VARCHAR(150),
    id_compte           INT NOT NULL,
    id_categorie        INT NOT NULL,
    id_utilisateur      INT NOT NULL,
    CONSTRAINT ck_operation_montant CHECK (montant_operation > 0),
    CONSTRAINT fk_operation_compte
        FOREIGN KEY (id_compte) REFERENCES compte(id_compte),
    CONSTRAINT fk_operation_categorie
        FOREIGN KEY (id_categorie) REFERENCES categorie(id_categorie),
    CONSTRAINT fk_operation_utilisateur
        FOREIGN KEY (id_utilisateur) REFERENCES utilisateur(id_utilisateur)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- REGLER : association 0,N - 0,N entre OPERATION et FACTURE (RG19)
-- ---------------------------------------------------------------------
CREATE TABLE regler (
    id_operation    INT NOT NULL,
    id_facture      INT NOT NULL,
    montant_affecte DECIMAL(15,2) NOT NULL,
    PRIMARY KEY (id_operation, id_facture),
    CONSTRAINT ck_regler_montant CHECK (montant_affecte > 0),
    CONSTRAINT fk_regler_operation
        FOREIGN KEY (id_operation) REFERENCES operation(id_operation),
    CONSTRAINT fk_regler_facture
        FOREIGN KEY (id_facture) REFERENCES facture(id_facture)
) ENGINE=InnoDB;

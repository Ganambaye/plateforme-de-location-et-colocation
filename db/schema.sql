-- ============================================================
-- Tanal Sa Logement — schéma de la base de données
-- ============================================================
-- À exécuter dans Supabase → SQL Editor → New query, sur un projet
-- NEUF (sinon supprimer d'abord les tables existantes).
--
-- Ce schéma reprend exactement les 9 tables de la version en ligne
-- (hébergement Qoder), avec en plus les clés étrangères et une
-- contrainte d'unicité sur l'email.
--
-- NOTE SÉCURITÉ — périmètre de test, à garder en tête :
-- comme sur la version actuelle, les politiques RLS ci-dessous
-- autorisent l'accès complet à la clé anonyme (anon). C'est le
-- périmètre de test fonctionnel accepté le 29/09/2026. Avant une
-- vraie mise en production : restreindre ces politiques et faire
-- porter les écritures par la clé service_role côté serveur.

-- ---------- Utilisateurs (étudiants, bailleurs, admin) ----------
CREATE TABLE public.users (
  id         uuid PRIMARY KEY,
  nom        text NOT NULL,
  prenom     text NOT NULL,
  email      text NOT NULL UNIQUE,
  mdp        text NOT NULL,            -- sha256 (périmètre de test)
  role       text NOT NULL,            -- etudiant | bailleur | admin
  telephone  text NOT NULL DEFAULT '',
  whatsapp   text NOT NULL DEFAULT '',
  cree_le    timestamptz NOT NULL
);

-- ---------- Sessions (jeton -> utilisateur) ----------
CREATE TABLE public.sessions (
  token     text PRIMARY KEY,
  user_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  cree_le   timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON public.sessions (user_id);

-- ---------- Annonces ----------
CREATE TABLE public.annonces (
  id          uuid PRIMARY KEY,
  bailleur_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  titre       text NOT NULL,
  type        text NOT NULL,           -- Studio | Chambre | Appartement | Colocation
  quartier    text NOT NULL,
  prix        integer NOT NULL,        -- FCFA / mois
  photo       text NOT NULL DEFAULT 'room1',
  description text NOT NULL DEFAULT '',
  statut      text NOT NULL,           -- en_attente | approuvee | rejectee
  cree_le     timestamptz NOT NULL,
  boost       jsonb                    -- { formule, jours, jusquAu } ou NULL
);
CREATE INDEX annonces_statut_idx ON public.annonces (statut);

-- ---------- Favoris ----------
CREATE TABLE public.favoris (
  id          uuid PRIMARY KEY,
  etudiant_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  annonce_id  uuid NOT NULL REFERENCES public.annonces(id) ON DELETE CASCADE
);
CREATE INDEX favoris_etudiant_idx ON public.favoris (etudiant_id);

-- ---------- Visites ----------
CREATE TABLE public.visites (
  id          uuid PRIMARY KEY,
  etudiant_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  annonce_id  uuid NOT NULL REFERENCES public.annonces(id) ON DELETE CASCADE,
  date        text NOT NULL,           -- AAAA-MM-JJ
  heure       text NOT NULL,           -- HH:MM
  statut      text NOT NULL            -- en_attente | confirmee | annulee
);
CREATE INDEX visites_annonce_idx ON public.visites (annonce_id);

-- ---------- Messages ----------
CREATE TABLE public.messages (
  id         uuid PRIMARY KEY,
  from_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  to_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  annonce_id uuid REFERENCES public.annonces(id) ON DELETE SET NULL,
  texte      text NOT NULL,
  lu         boolean NOT NULL DEFAULT false,
  date       timestamptz NOT NULL
);
CREATE INDEX messages_to_idx ON public.messages (to_id);

-- ---------- Paiements (boosts) ----------
CREATE TABLE public.paiements (
  id          uuid PRIMARY KEY,
  annonce_id  uuid NOT NULL REFERENCES public.annonces(id) ON DELETE CASCADE,
  bailleur_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  formule     text NOT NULL,           -- premium | standard | basic
  jours       integer NOT NULL,
  montant     integer NOT NULL,        -- FCFA
  mode        text NOT NULL,           -- Wave | Orange Money | ...
  date        timestamptz NOT NULL
);
CREATE INDEX paiements_bailleur_idx ON public.paiements (bailleur_id);

-- ---------- Avis (notes des étudiants) ----------
CREATE TABLE public.avis (
  id          uuid PRIMARY KEY,
  annonce_id  uuid NOT NULL REFERENCES public.annonces(id) ON DELETE CASCADE,
  etudiant_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  note        integer NOT NULL,        -- 1 à 5
  texte       text NOT NULL DEFAULT '',
  date        timestamptz NOT NULL
);
CREATE INDEX avis_annonce_idx ON public.avis (annonce_id);

-- ---------- Journal d'événements (dashboard admin) ----------
CREATE TABLE public.evenements (
  id    uuid PRIMARY KEY,
  texte text NOT NULL,
  date  timestamptz NOT NULL
);

-- ============================================================
-- RLS — accès anonyme complet (périmètre de test, voir note en tête).
-- L'API (Function Vercel) interroge la base avec la clé anon.
-- ============================================================
ALTER TABLE public.users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.annonces   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favoris    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visites    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paiements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avis       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evenements ENABLE ROW LEVEL SECURITY;

CREATE POLICY tanal_anon_users      ON public.users      FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY tanal_anon_sessions   ON public.sessions   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY tanal_anon_annonces   ON public.annonces   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY tanal_anon_favoris    ON public.favoris    FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY tanal_anon_visites    ON public.visites    FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY tanal_anon_messages   ON public.messages   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY tanal_anon_paiements  ON public.paiements  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY tanal_anon_avis       ON public.avis       FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY tanal_anon_evenements ON public.evenements FOR ALL TO anon USING (true) WITH CHECK (true);

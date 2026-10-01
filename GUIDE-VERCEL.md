# Héberger Tanal Sa Logement sur Vercel (avec Supabase)

Ce guide explique comment mettre la plateforme en ligne sur **Vercel** avec votre
propre base de données **Supabase**. Tout est gratuit aux tarifs de base
(Vercel Hobby + Supabase Free). Comptez environ **20 minutes**.

Sur Vercel, le site s'affiche **sans le badge « Made with Qoder »** : ce badge est
ajouté uniquement par l'hébergement Qoder Sites, pas par le code du site.

## Comment ça marche

```
Navigateur ──> Vercel
               ├─ public/            → les pages du site (HTML, CSS, JS, PWA)
               └─ api/index.mjs      → une seule fonction (Function Edge) qui
                                         contient toute l'API (connexion, annonces,
                                         favoris, messages, admin…)
                         │
                         └──> Supabase (votre projet) → les données
```

- Les fichiers du site sont ceux de `public/` — identiques à la version Qoder.
- L'API est la même que celle de la version Qoder (`functions/handler.mjs`),
  branchée sur votre base Supabase au lieu de celle de Qoder.
- **Les deux hébergements sont indépendants** : la version Qoder
  (tanal-sa-logement…qoder.website) garde ses données, la version Vercel aura
  les siennes. Le site local (`npm start`) utilise ses propres fichiers JSON.

---

## Étape 1 — Créer le projet Supabase

1. Allez sur **https://supabase.com** et créez un compte (gratuit).
2. Cliquez sur **New project** :
   - **Name** : `tanal-sa-logement`
   - **Database Password** : choisissez un mot de passe et gardez-le (notez-le,
     il ne servira pas au site mais il protège votre base).
   - **Region** : `West EU (Frankfurt)` — la région la plus proche du Sénégal.
3. Attendez ~2 minutes que le projet soit prêt (statut vert).

## Étape 2 — Créer les tables

1. Dans Supabase, ouvrez **SQL Editor** (icône `>_` dans le menu de gauche).
2. Cliquez **New query**.
3. Ouvrez le fichier **`db/schema.sql`** de ce projet, copiez tout son contenu
   et collez-le dans l'éditeur SQL.
4. Cliquez **Run** (ou Ctrl+Entrée). Vous devez voir
   `Success. No rows returned`.

Les 9 tables sont créées : `users`, `sessions`, `annonces`, `favoris`,
`visites`, `messages`, `paiements`, `avis`, `evenements`.

## Étape 3 — Copier les deux clés

1. Dans Supabase, allez dans **Settings → API** (roue dentée, menu de gauche).
2. Copiez et gardez sous la main :
   - **Project URL** (ex. `https://abcdefgh.supabase.co`) → ce sera `SUPABASE_URL`
   - **anon public** (une longue clé) → ce sera `SUPABASE_ANON_KEY`
     ⚠️ Prenez bien la clé **anon public**, jamais la clé `service_role`
     (elle donne un accès total à la base et ne doit pas quitter le serveur).

## Étape 4 — Déployer sur Vercel

### Option A — via GitHub (recommandée : le site se redéploie tout seul à chaque mise à jour)

1. Mettez d'abord le code à jour sur GitHub (depuis le dossier du projet) :

   ```bash
   git add api db vercel.json package.json package-lock.json .gitignore public functions dev
   git commit -m "Hébergement Vercel : function edge + schéma Supabase + guide"
   git push
   ```

2. Allez sur **https://vercel.com** et connectez-vous **avec GitHub**.
3. Cliquez **Add New… → Project**, puis **Import** sur le dépôt
   `Ganambaye/plateforme-de-location-et-colocation`.
4. Vercel détecte la configuration tout seul (Framework Preset : *Other*,
   dossier de sortie : `public`, fonctions : `api/`). Ne changez rien.
5. **Avant de cliquer sur Deploy**, dépliez **Environment Variables** et
   ajoutez les deux variables :

   | Name                | Value                            |
   |---------------------|----------------------------------|
   | `SUPABASE_URL`      | votre Project URL de l'étape 3   |
   | `SUPABASE_ANON_KEY` | votre clé anon public            |

6. Cliquez **Deploy** et attendez ~1 minute. Vercel vous donne l'adresse du
   site, par ex. `https://tanal-sa-logement.vercel.app`.

### Option B — sans GitHub, directement depuis ce dossier (ligne de commande)

```bash
npm install -g vercel
vercel login            # choisissez GitHub ou l'email
vercel                  # 1er déploiement : répondez Y, nommez le projet
```

Ensuite ajoutez les variables (copier-coller les valeurs de l'étape 3) :

```bash
vercel env add SUPABASE_URL
vercel env add SUPABASE_ANON_KEY
```

(répondez pour les 3 environnements proposés : Production, Preview, Development,
ou cochez-les dans le tableau de bord). Puis déployez en production :

```bash
vercel --prod
```

## Étape 5 — Initialiser les données de démonstration

Une seule fois, appelez l'API de seed (remplacez par votre adresse Vercel) :

- **Git Bash** : `curl -X POST https://tanal-sa-logement.vercel.app/api/seed`
- **PowerShell** : `curl.exe -X POST https://tanal-sa-logement.vercel.app/api/seed`

Réponse attendue : `{"ok":true}`. La base reçoit les 6 comptes, 22 annonces,
messages, paiements et avis de démonstration. Un second appel répond
`{"error":"Déjà initialisé"}` : c'est normal.

## Étape 6 — Vérifier

1. Ouvrez votre adresse Vercel : la page d'accueil s'affiche avec les 9
   annonces approuvées.
2. Connectez-vous avec les comptes de démonstration :

   | Rôle     | Email               | Mot de passe |
   |----------|---------------------|--------------|
   | Admin    | admin@tanal.sn      | admin123     |
   | Bailleur | bailleur@tanal.sn   | bailleur123  |
   | Étudiant | etudiant@tanal.sn   | etudiant123  |

3. Testez la validation d'une annonce côté admin, un favori côté étudiant :
   tout fonctionne comme sur la version Qoder, mais dans **votre** base
   Supabase (vous pouvez voir les données dans Supabase → Table Editor).
4. L'installation PWA (menu ⋮ → « Installer l'application ») fonctionne
   également sur l'adresse Vercel.

---

## Après le déploiement

- **Mettre le site à jour** (Option A) : modifiez le code, puis
  `git add … && git commit -m "…" && git push` → Vercel redéploie tout seul
  en ~1 minute. Aucune manipulation de base n'est nécessaire tant que le
  schéma ne change pas.
- **Adresse personnalisée** : Vercel → votre projet → **Settings → Domains** →
  ajoutez un nom de domaine que vous possédez (ex. `tanalsalogement.sn`) et
  suivez les instructions DNS.
- **Coûts** : Vercel Hobby et Supabase Free suffisent largement pour une démo.
  Note : le plan Hobby de Vercel est destiné à un usage personnel/non
  commercial ; pour un usage commercial il faut le plan Pro (~20 $/mois).
  Un projet Supabase Free se met en pause après une longue période sans
  visite ; il se réactive en un clic dans le tableau de bord.

## Avant une vraie mise en production (important)

Le déploiement décrit ici correspond au **périmètre de test** accepté pour la
démo : la clé anon peut lire et écrire dans toutes les tables (politiques RLS
ouvertes), et les mots de passe de démonstration sont publics (README). Pour
une plateforme ouverte à de vrais utilisateurs :

1. Changer les mots de passe de démonstration (et idéalement créer de vrais
   comptes admin).
2. Restreindre les politiques RLS dans Supabase (SQL Editor → Policies) et
   faire porter les écritures sensibles par la clé `service_role`, gardée en
   variable d'environnement Vercel.
3. Ajouter une confirmation par email à l'inscription (Supabase Auth) et une
   limitation du nombre d'annonces par bailleur.

Ces renforcements ne demandent pas de changer l'interface du site, seulement
la couche API/sécurité — demandez-moi et je les prépare.

## Fichiers ajoutés pour Vercel

| Fichier                    | Rôle                                                          |
|----------------------------|---------------------------------------------------------------|
| `api/index.mjs`           | Point d'entrée Vercel : branche la Function Edge sur l'API    |
| `vercel.json`              | Configuration Vercel (dossier public/, réécriture /api/*, cache du service worker) |
| `db/schema.sql`            | Schéma complet des 9 tables + politiques RLS, à coller dans Supabase |
| `dev/test-vercel.mjs`      | Tests (27 vérifications) : `npm run test:vercel`              |
| `public/js/api.js`         | Détecte l'hébergeur : `/api` (local + Vercel) ou `/functions/v1/app` (Qoder) |

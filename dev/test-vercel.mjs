// Test local de la version Vercel — sans réseau ni base réelle :
//   1. Le point d'entrée api/index.mjs branche bien handler.mjs
//      (vérifié sur les routes sans base : /api/meta, 404, erreur de config).
//   2. Le parcours complet de l'application (seed -> annonces ->
//      connexion -> espace admin -> favoris -> messages) fonctionne
//      à travers le préfixe /api, sur une base en mémoire qui simule
//      la partie de l'API supabase-js utilisée par handler.mjs.
//
// Lancement : npm run test:vercel
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { handleApp } from '../functions/handler.mjs';

const ORIGINE = 'https://tanal.vercel.app';
let ok = 0;
const verifier = (cond, libelle) => {
  assert.ok(cond, 'ÉCHEC : ' + libelle);
  ok++;
  console.log('  OK  ' + libelle);
};

// ---------- Base en mémoire + faux client supabase ----------
function fauxSupabase(base) {
  return {
    from(table) {
      const etat = { filtres: [], tri: null, limite: null, unique: false, compter: false, action: 'select' };
      const filtre = () => {
        const t = base[table] || (base[table] = []);
        let liste = t.slice();
        for (const f of etat.filtres) liste = f(liste);
        return { t, liste, total: liste.length };
      };
      const b = {
        select(_cols, opts) {
          if (opts && opts.count === 'exact') etat.compter = true;
          return b;
        },
        eq(col, val) { etat.filtres.push((l) => l.filter((r) => String(r[col]) === String(val))); return b; },
        in(col, vals) {
          const s = new Set(vals.map(String));
          etat.filtres.push((l) => l.filter((r) => s.has(String(r[col]))));
          return b;
        },
        order(col, opts) { etat.tri = { col, asc: !!(opts && opts.ascending) }; return b; },
        limit(n) { etat.limite = n; return b; },
        maybeSingle() { etat.unique = true; return b; },
        insert(vals) { etat.action = 'insert'; etat.valeurs = vals; return b; },
        update(patch) { etat.action = 'update'; etat.patch = patch; return b; },
        delete() { etat.action = 'delete'; return b; },
        then(resolu, rejet) { return b.executer().then(resolu, rejet); },
        async executer() {
          const { t, liste, total } = filtre();
          if (etat.action === 'insert') {
            const vals = Array.isArray(etat.valeurs) ? etat.valeurs : [etat.valeurs];
            t.push(...vals.map((v) => ({ ...v })));
            return { data: null, error: null };
          }
          if (etat.action === 'update') {
            for (const r of liste) Object.assign(r, etat.patch);
            return { data: null, error: null };
          }
          if (etat.action === 'delete') {
            const cibles = new Set(liste);
            base[table] = t.filter((r) => !cibles.has(r));
            return { data: null, error: null };
          }
          let l = liste.slice();
          if (etat.tri) {
            const { col, asc } = etat.tri;
            l.sort((x, y) => {
              const a = String(x[col]);
              const c = String(y[col]);
              return (a < c ? -1 : a > c ? 1 : 0) * (asc ? 1 : -1);
            });
          }
          if (etat.limite != null) l = l.slice(0, etat.limite);
          const data = etat.unique ? (l[0] ? { ...l[0] } : null) : l.map((r) => ({ ...r }));
          return { data, error: null, count: etat.compter ? total : undefined };
        }
      };
      return b;
    }
  };
}

const appel = (supabase, chemin, opts = {}) =>
  handleApp({
    request: new Request(ORIGINE + chemin, {
      method: opts.methode || 'GET',
      headers: opts.jeton ? { 'x-tanal-token': opts.jeton } : {},
      body: opts.corps ? JSON.stringify(opts.corps) : undefined
    }),
    supabase
  });

// ---------- 1. Point d'entrée Vercel ----------
console.log("Point d'entrée api/index.mjs");
const cheminEntree = fileURLToPath(new URL('../api/index.mjs', import.meta.url));
const entree = await import(pathToFileURL(cheminEntree).href);

const sauvUrl = process.env.SUPABASE_URL;
const sauvCle = process.env.SUPABASE_ANON_KEY;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_ANON_KEY;
let r = await entree.default(new Request(ORIGINE + '/api/meta'));
verifier(r.status === 500, "signale les variables d'environnement manquantes (500)");
process.env.SUPABASE_URL = 'https://exemple.supabase.co';
process.env.SUPABASE_ANON_KEY = 'cle-test';
r = await entree.default(new Request(ORIGINE + '/api/meta'));
const meta = await r.json();
verifier(r.status === 200 && meta.formules.premium === 5000, '/api/meta répond (aucune base requise)');
r = await entree.default(new Request(ORIGINE + '/api/inconnu'));
verifier(r.status === 404, 'route inconnue -> 404');
process.env.SUPABASE_URL = sauvUrl;
process.env.SUPABASE_ANON_KEY = sauvCle;

// ---------- 2. Parcours complet via le préfixe /api ----------
console.log('Parcours complet via le préfixe /api (base en mémoire)');
const base = {};
const supabase = fauxSupabase(base);

r = await appel(supabase, '/api/seed', { methode: 'POST' });
verifier(r.status === 200, 'POST /api/seed initialise la base démo');
r = await appel(supabase, '/api/seed', { methode: 'POST' });
verifier(r.status === 409, 'un second /api/seed est refusé (409)');
verifier(base.users.length === 6 && base.annonces.length === 22, '6 utilisateurs et 22 annonces créées');

r = await appel(supabase, '/api/annonces');
let annonces = await r.json();
verifier(r.status === 200 && annonces.length === 9, 'GET /api/annonces -> 9 annonces approuvées');
verifier(annonces[0].boostActif === true && annonces[0].bailleur.nom === 'Mbedji', "l'annonce boostée passe en premier avec son bailleur");

r = await appel(supabase, '/api/annonces?type=Studio&prixMax=90000');
annonces = await r.json();
verifier(annonces.length > 0 && annonces.every((a) => a.type === 'Studio' && a.prix <= 90000), 'filtres type + prixMax respectés');

r = await appel(supabase, '/api/annonces?type=Studio&quartier=Yoff');
annonces = await r.json();
verifier(annonces.length === 0, 'filtre quartier sans résultat -> liste vide');

r = await appel(supabase, '/api/connexion', { methode: 'POST', corps: { email: 'admin@tanal.sn', password: 'mauvais' } });
verifier(r.status === 401, 'mauvais mot de passe -> 401');
r = await appel(supabase, '/api/connexion', { methode: 'POST', corps: { email: 'admin@tanal.sn', password: 'admin123' } });
const admin = await r.json();
verifier(r.status === 200 && admin.user.role === 'admin', 'connexion admin via /api/connexion');

r = await appel(supabase, '/api/admin/stats', { jeton: admin.token });
const stats = await r.json();
verifier(r.status === 200 && stats.utilisateurs === 6 && stats.actives === 9, '/api/admin/stats (préfixe /api + rôle admin)');
verifier(stats.revenus === 42500 && stats.enAttente === 12, 'stats cohérentes : 42 500 FCFA de revenus, 12 annonces en attente');

r = await appel(supabase, '/api/admin/annonces?statut=en_attente', { jeton: admin.token });
const enAttente = await r.json();
verifier(r.status === 200 && enAttente.length === 12, '/api/admin/annonces?statut=en_attente -> 12');

r = await appel(supabase, '/api/inscription', { methode: 'POST', corps: { role: 'bailleur', nom: 'Test', prenom: 'Ali', email: 'ali@test.sn', password: 'secret123' } });
const insc = await r.json();
verifier(r.status === 201 && insc.token && insc.user.email === 'ali@test.sn', 'POST /api/inscription crée un compte + jeton');
r = await appel(supabase, '/api/annonces/mes', { jeton: insc.token });
verifier(r.status === 200 && (await r.json()).length === 0, 'GET /api/annonces/mes (bailleur sans annonce)');

r = await appel(supabase, '/api/connexion', { methode: 'POST', corps: { email: 'etudiant@tanal.sn', password: 'etudiant123' } });
const etu = await r.json();
verifier(r.status === 200 && etu.user.role === 'etudiant', 'connexion étudiant');

r = await appel(supabase, '/api/favoris', { jeton: etu.token });
const favoris = await r.json();
verifier(r.status === 200 && favoris.length === 7, "l'étudiant retrouve ses 7 favoris");

r = await appel(supabase, '/api/annonces/' + favoris[0].id, { jeton: etu.token });
const detail = await r.json();
verifier(r.status === 200 && detail.favori === true && Array.isArray(detail.avis), 'détail /api/annonces/<uuid> avec avis');

r = await appel(supabase, '/api/admin/stats', { jeton: etu.token });
verifier(r.status === 403, 'un étudiant ne peut pas accéder à /api/admin/stats (403)');

r = await appel(supabase, '/api/conversations', { jeton: etu.token });
const convs = await r.json();
verifier(r.status === 200 && convs.length === 1 && convs[0].nonLu === 2, '/api/conversations : 1 conversation, 2 messages non lus');

r = await appel(supabase, '/api/messages?avec=' + convs[0].user.id, { jeton: etu.token });
const fil = await r.json();
verifier(r.status === 200 && fil.length === 3, 'fil de messages complet (3 messages)');

r = await appel(supabase, '/api/messages', { methode: 'POST', jeton: etu.token, corps: { toId: convs[0].user.id, texte: 'Merci !' } });
verifier(r.status === 201, 'envoi d\'un message');

r = await appel(supabase, '/api/deconnexion', { methode: 'POST', jeton: etu.token });
verifier(r.status === 200, 'POST /api/deconnexion');
r = await appel(supabase, '/api/me', { jeton: etu.token });
verifier(r.status === 401, 'le jeton déconnecté ne fonctionne plus (401)');

r = await appel(supabase, '/api/me', { jeton: insc.token });
const moi = await r.json();
verifier(r.status === 200 && moi.nonLus === 0, 'GET /api/me avec compteur de messages non lus');

console.log('\n' + ok + ' vérifications réussies — la version Vercel est prête.');

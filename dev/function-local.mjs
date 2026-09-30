// Harnais local : vérifie functions/handler.mjs avec un faux client Supabase en mémoire.
import assert from 'node:assert/strict';
import { handleApp } from '../functions/handler.mjs';

const store = {
  users: [], sessions: [], annonces: [], favoris: [], visites: [],
  messages: [], paiements: [], avis: [], evenements: []
};

class QBuilder {
  constructor(db, table) {
    this._db = db; this._table = table; this._filters = []; this._action = 'select';
    this._cols = '*'; this._count = false; this._limit = null; this._order = null;
    this._update = null; this._insert = null; this._single = false;
  }
  select(cols = '*', opts) {
    this._action = 'select'; this._cols = cols;
    if (opts && opts.count === 'exact') this._count = true;
    return this;
  }
  insert(rows) { this._action = 'insert'; this._insert = Array.isArray(rows) ? rows : [rows]; return this; }
  update(obj) { this._action = 'update'; this._update = obj; return this; }
  delete() { this._action = 'delete'; return this; }
  eq(col, val) { this._filters.push([col, val, 'eq']); return this; }
  in(col, vals) { this._filters.push([col, vals, 'in']); return this; }
  order(col, opts) { this._order = [col, !(opts && opts.ascending === false)]; return this; }
  limit(n) { this._limit = n; return this; }
  maybeSingle() { this._single = true; return this; }
  single() { this._single = 'strict'; return this; }
  then(resolve) { resolve(this._exec()); }
  _exec() {
    const rows = () => {
      let out = [...(this._db[this._table] || [])];
      for (const [col, val, op] of this._filters) {
        out = out.filter((r) => op === 'eq' ? r[col] === val : (Array.isArray(val) ? val.includes(r[col]) : false));
      }
      return out;
    };
    if (this._action === 'insert') {
      for (const row of this._insert) this._db[this._table].push({ ...row });
      return { data: this._insert, error: null };
    }
    if (this._action === 'update') {
      const hit = rows();
      for (const r of hit) Object.assign(r, this._update);
      return { data: hit, error: null };
    }
    if (this._action === 'delete') {
      const hit = rows();
      const t = this._db[this._table];
      for (const r of hit) { const i = t.indexOf(r); if (i >= 0) t.splice(i, 1); }
      return { data: hit, error: null };
    }
    let out = rows();
    const count = this._count ? out.length : null;
    if (this._order) {
      const [col, asc] = this._order;
      out = [...out].sort((a, b) => (a[col] < b[col] ? -1 : 1) * (asc ? 1 : -1));
    }
    if (this._limit != null) out = out.slice(0, this._limit);
    if (this._cols !== '*') {
      const cols = this._cols.split(',').map((s) => s.trim());
      out = out.map((r) => { const o = {}; for (const c of cols) o[c] = r[c]; return o; });
    }
    if (this._single) return { data: out[0] ?? null, error: null, count };
    return { data: out, error: null, count };
  }
}

const supabase = { from: (table) => new QBuilder(store, table) };

const BASE = 'http://localhost/functions/v1/app';
async function req(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers['x-tanal-token'] = token;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const request = new Request(BASE + path, {
    method, headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const res = await handleApp({ request, supabase });
  return { status: res.status, body: await res.json() };
}

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}

const admin = { email: 'admin@tanal.sn', password: 'admin123' };
const bailleur = { email: 'bailleur@tanal.sn', password: 'bailleur123' };
const etudiant = { email: 'etudiant@tanal.sn', password: 'etudiant123' };

console.log('== Tanal Sa Logement : vérification handler.mjs ==\n');

await t('meta public', async () => {
  const { status, body } = await req('GET', '/meta');
  assert.equal(status, 200);
  assert.ok(body.quartiers.length >= 8 && body.types.length === 4);
  assert.equal(body.formules.premium, 5000);
});

await t('seed une fois puis 409', async () => {
  const r1 = await req('POST', '/seed');
  assert.equal(r1.status, 200);
  assert.equal(r1.body.ok, true);
  const r2 = await req('POST', '/seed');
  assert.equal(r2.status, 409);
});

await t('connexion admin + mauvais mot de passe', async () => {
  const bad = await req('POST', '/connexion', { body: { email: admin.email, password: 'xx' } });
  assert.equal(bad.status, 401);
  const ok = await req('POST', '/connexion', { body: admin });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.role, 'admin');
  assert.ok(ok.body.token.length > 30);
});

let tokE, tokB, tokA;
const login = async (who) => (await req('POST', '/connexion', { body: who })).body.token;
tokA = await login(admin);
tokE = await login(etudiant);
tokB = await login(bailleur);

await t('401 sans token / 403 mauvais rôle', async () => {
  assert.equal((await req('GET', '/me')).status, 401);
  assert.equal((await req('GET', '/admin/stats', { token: tokE })).status, 403);
  assert.equal((await req('GET', '/favoris', { token: tokB })).status, 403);
});

await t('/me étudiant + nonLus', async () => {
  const { status, body } = await req('GET', '/me', { token: tokE });
  assert.equal(status, 200);
  assert.equal(body.role, 'etudiant');
  assert.equal(typeof body.nonLus, 'number');
});

await t('annonces publiques : 9, boost en tête', async () => {
  const { status, body } = await req('GET', '/annonces');
  assert.equal(status, 200);
  assert.equal(body.length, 9);
  assert.equal(body[0].boostActif, true);
  assert.equal(body[0].statut, 'approuvee');
  assert.ok(!body.some((a) => a.statut !== 'approuvee'));
});

let newApprovedId, rejectedId;
await t('admin : 12 en attente, validation → 10 actives', async () => {
  const { status, body } = await req('GET', '/admin/annonces?statut=en_attente', { token: tokA });
  assert.equal(status, 200);
  assert.equal(body.length, 12);
  newApprovedId = body[0].id;
  const patch = await req('PATCH', `/annonces/${newApprovedId}/statut`, { token: tokA, body: { statut: 'approuvee' } });
  assert.equal(patch.status, 200);
  assert.equal(patch.body.statut, 'approuvee');
  const after = await req('GET', '/annonces');
  assert.equal(after.body.length, 10);
  const reject = await req('GET', '/admin/annonces?statut=rejectee', { token: tokA });
  rejectedId = reject.body[0]?.id;
});

await t('admin stats : compteurs et revenus', async () => {
  const { status, body } = await req('GET', '/admin/stats', { token: tokA });
  assert.equal(status, 200);
  assert.equal(body.utilisateurs, 6);
  assert.equal(body.revenus, 42500);
  assert.equal(body.actives, 10);
  assert.equal(body.enAttente, 11);
  assert.equal(body.visites, 4);
});

await t('admin listes : utilisateurs/quartiers/prix/paiements/avis', async () => {
  for (const s of ['utilisateurs', 'quartiers', 'prix', 'paiements', 'avis', 'evenements', 'messages']) {
    const { status, body } = await req('GET', `/admin/${s}`, { token: tokA });
    assert.equal(status, 200, `admin/${s}`);
    assert.ok(Array.isArray(body), `admin/${s} array`);
  }
  const q = await req('GET', '/admin/quartiers', { token: tokA });
  assert.equal(q.body.length, 10);
  const u = await req('GET', '/admin/utilisateurs', { token: tokA });
  assert.equal(u.body.length, 6);
});

await t('favoris toggle on/off (étudiant)', async () => {
  const on = await req('POST', '/favoris', { token: tokE, body: { annonceId: newApprovedId } });
  assert.equal(on.status, 200);
  assert.equal(on.body.favori, true);
  const off = await req('POST', '/favoris', { token: tokE, body: { annonceId: newApprovedId } });
  assert.equal(off.body.favori, false);
  const list = await req('GET', '/favoris', { token: tokE });
  assert.equal(list.body.length, 7);
  assert.ok(list.body.every((a) => a.favori === true));
});

await t('visites : création + liste étudiant', async () => {
  const d = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const post = await req('POST', '/visites', { token: tokE, body: { annonceId: newApprovedId, date: d, heure: '10:30' } });
  assert.equal(post.status, 201);
  const get = await req('GET', '/visites', { token: tokE });
  assert.equal(get.status, 200);
  assert.ok(get.body.some((v) => v.annonce_id === newApprovedId));
  assert.ok(get.body.every((v) => v.annonce && v.annonce.titre && v.etudiant));
});

await t('visites bailleur : confirmer une visite', async () => {
  const get = await req('GET', '/visites', { token: tokB });
  assert.ok(get.body.length >= 1);
  const cible = get.body.find((v) => v.statut === 'en_attente');
  assert.ok(cible, 'visite en attente pour bailleur');
  const patch = await req('PATCH', `/visites/${cible.id}/statut`, { token: tokB, body: { statut: 'confirmee' } });
  assert.equal(patch.status, 200);
  assert.equal(patch.body.statut, 'confirmee');
});

let meId;
await t('messages : envoi, conversations, fil lu', async () => {
  meId = (await req('GET', '/me', { token: tokE })).body.id;
  const bId = (await req('GET', '/me', { token: tokB })).body.id;
  const post = await req('POST', '/messages', { token: tokE, body: { toId: bId, annonceId: newApprovedId, texte: 'Test message' } });
  assert.equal(post.status, 201);
  const conv = await req('GET', '/conversations', { token: tokE });
  assert.equal(conv.status, 200);
  const c = conv.body.find((x) => x.user.id === bId);
  assert.ok(c && c.dernier.texte === 'Test message');
  const thread = await req('GET', `/messages?avec=${bId}`, { token: tokE });
  assert.equal(thread.status, 200);
  assert.ok(thread.body.length >= 3);
  assert.ok(thread.body.every((m) => typeof m.fromId === 'string' && 'texte' in m), 'messages en camelCase');
  const me = await req('GET', '/me', { token: tokE });
  assert.equal(me.body.nonLus, 0);
});

await t('avis étudiant sur annonce', async () => {
  const post = await req('POST', '/avis', { token: tokE, body: { annonceId: newApprovedId, note: 5, texte: 'Super logement' } });
  assert.equal(post.status, 201);
  const det = await req('GET', `/annonces/${newApprovedId}`, { token: tokE });
  assert.equal(det.status, 200);
  assert.ok(det.body.avis.some((v) => v.note === 5));
  assert.equal(det.body.bailleur.role, 'bailleur');
  assert.equal(typeof det.body.bailleurId, 'string', 'bailleurId présent pour la messagerie');
  assert.equal(det.body.favori, false);
});

await t('annonce rejectée invisible publiquement, visible par l\'admin', async () => {
  if (!rejectedId) return; // aucune rejectée en base = ok
  assert.equal((await req('GET', `/annonces/${rejectedId}`)).status, 404);
  assert.equal((await req('GET', `/annonces/${rejectedId}`, { token: tokA })).status, 200);
});

await t('bailleur : créer annonce + mes annonces', async () => {
  const before = (await req('GET', '/annonces/mes', { token: tokB })).body.length;
  const post = await req('POST', '/annonces', {
    token: tokB,
    body: { titre: 'Studio test harnais', type: 'Studio', quartier: 'Yoff', prix: 60000, photo: 'room2' }
  });
  assert.equal(post.status, 201);
  assert.equal(post.body.statut, 'en_attente');
  const after = await req('GET', '/annonces/mes', { token: tokB });
  assert.equal(after.body.length, before + 1);
  const mine = after.body.find((a) => a.titre === 'Studio test harnais');
  assert.ok(mine && mine.bailleur.role === 'bailleur');
});

await t('boost : paiement enregistré + boostActif', async () => {
  const mine = (await req('GET', '/annonces/mes', { token: tokB })).body;
  const a1 = mine.find((a) => a.titre === 'Studio étudiant meublé - Point E');
  assert.ok(a1, 'annonce a1 de Mady');
  const post = await req('POST', `/annonces/${a1.id}/boost`, { token: tokB, body: { formule: 'standard', jours: 1, mode: 'Wave' } });
  assert.equal(post.status, 200);
  assert.equal(post.body.paiement.montant, 2500);
  assert.equal(post.body.annonce.boostActif, true);
  assert.equal(post.body.annonce.boost.formule, 'standard');
  const stats = await req('GET', '/admin/stats', { token: tokA });
  assert.equal(stats.body.revenus, 42500 + 2500);
});

await t('boost refusé sur l\'annonce d\'un autre', async () => {
  const other = (await req('GET', '/admin/annonces?statut=approuvee', { token: tokA })).body
    .find((a) => a.bailleur.email === 'aminata@tanal.sn');
  assert.ok(other, 'annonce d\'Aminata');
  const post = await req('POST', `/annonces/${other.id}/boost`, { token: tokB, body: { formule: 'basic', jours: 1, mode: 'Wave' } });
  assert.equal(post.status, 404);
});

await t('inscription + déconnexion invalide le token', async () => {
  const reg = await req('POST', '/inscription', {
    body: { nom: 'Test', prenom: 'User', email: 'test@tanal.sn', password: 'test123', role: 'etudiant' }
  });
  assert.equal(reg.status, 201);
  assert.equal(reg.body.user.role, 'etudiant');
  const dup = await req('POST', '/inscription', {
    body: { nom: 'Test', prenom: 'User', email: 'test@tanal.sn', password: 'test123', role: 'etudiant' }
  });
  assert.equal(dup.status, 400);
  const out = await req('POST', '/deconnexion', { token: reg.body.token });
  assert.equal(out.status, 200);
  assert.equal((await req('GET', '/me', { token: reg.body.token })).status, 401);
});

await t('route inconnue → 404, méthode refusée → 404', async () => {
  assert.equal((await req('GET', '/inconnu')).status, 404);
  assert.equal((await req('DELETE', '/annonces')).status, 404);
});

console.log(`\n== ${pass} réussis, ${fail} échoués ==`);
process.exit(fail ? 1 : 0);

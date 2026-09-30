const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db, save, hash } = require('./lib/db');

const PUBLIC = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;
const TYPES = ['Studio', 'Chambre', 'Appartement', 'Colocation'];
const QUARTIERS = ['Almadies', 'Yoff', 'Sacré-Cœur', 'Point E', 'Ouakam', 'Mermoz', 'Grand Yoff', 'Dakar Plateau', 'Fann', 'Médina'];
const FORMULES = { premium: 5000, standard: 2500, basic: 1000 };

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

const nid = () => db.seq++;
const pubUser = (u) => u && ({ id: u.id, nom: u.nom, prenom: u.prenom, email: u.email, role: u.role, telephone: u.telephone, whatsapp: u.whatsapp, creeLe: u.creeLe });
const findUser = (id) => db.users.find((u) => u.id === id);
const findAnnonce = (id) => db.annonces.find((a) => a.id === id);
const ev = (texte) => { db.evenements.push({ id: nid(), texte, date: new Date().toISOString() }); };

function annonceVue(a, user) {
  const bailleur = findUser(a.bailleurId);
  return {
    ...a,
    bailleur: pubUser(bailleur),
    boostActif: !!(a.boost && new Date(a.boost.jusquAu) > new Date()),
    favori: user && user.role === 'etudiant' ? db.favoris.some((f) => f.etudiantId === user.id && f.annonceId === a.id) : false
  };
}

function send(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
  });
}

function auth(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token || !db.sessions[token]) return null;
  return findUser(db.sessions[token]) || null;
}

function nonLus(userId) {
  return db.messages.filter((m) => m.toId === userId && !m.lu).length;
}

const routes = [
  ['POST', /^\/api\/inscription$/, (c) => {
    const { role, nom, prenom, email, telephone, whatsapp, password } = c.body;
    if (!['etudiant', 'bailleur'].includes(role) || !nom || !prenom || !email || !password) {
      return send(c.res, 400, { error: 'Champs obligatoires manquants' });
    }
    if (db.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      return send(c.res, 400, { error: 'Un compte existe déjà avec cet email' });
    }
    const u = {
      id: nid(), nom, prenom, email: email.toLowerCase(), mdp: hash(password), role,
      telephone: telephone || '', whatsapp: whatsapp || '', creeLe: new Date().toISOString()
    };
    db.users.push(u);
    const token = crypto.randomBytes(24).toString('hex');
    db.sessions[token] = u.id;
    ev(`Nouvelle inscription ${role} : ${prenom} ${nom}`);
    save();
    send(c.res, 201, { token, user: pubUser(u) });
  }],

  ['POST', /^\/api\/connexion$/, (c) => {
    const { email, password } = c.body;
    const u = db.users.find((x) => x.email.toLowerCase() === String(email || '').toLowerCase());
    if (!u || u.mdp !== hash(password || '')) return send(c.res, 401, { error: 'Email ou mot de passe incorrect' });
    const token = crypto.randomBytes(24).toString('hex');
    db.sessions[token] = u.id;
    save();
    send(c.res, 200, { token, user: pubUser(u) });
  }],

  ['GET', /^\/api\/me$/, (c) => {
    if (!c.user) return send(c.res, 401, { error: 'Non connecté' });
    send(c.res, 200, { ...pubUser(c.user), nonLus: nonLus(c.user.id) });
  }],

  ['POST', /^\/api\/deconnexion$/, (c) => {
    const token = (c.req.headers.authorization || '').replace('Bearer ', '');
    delete db.sessions[token];
    save();
    send(c.res, 200, { ok: true });
  }],

  ['GET', /^\/api\/meta$/, (c) => {
    send(c.res, 200, {
      types: TYPES, quartiers: QUARTIERS,
      prixMax: [50000, 75000, 100000, 150000, 250000],
      formules: FORMULES
    });
  }],

  ['GET', /^\/api\/annonces$/, (c) => {
    const q = c.query;
    let list = db.annonces.filter((a) => a.statut === 'approuvee');
    if (q.type) list = list.filter((a) => a.type === q.type);
    if (q.quartier) list = list.filter((a) => a.quartier === q.quartier);
    if (q.prixMax) list = list.filter((a) => a.prix <= Number(q.prixMax));
    if (q.q) {
      const s = q.q.toLowerCase();
      list = list.filter((a) => (a.titre + ' ' + a.quartier).toLowerCase().includes(s));
    }
    list.sort((x, y) => {
      const bx = x.boost && new Date(x.boost.jusquAu) > new Date() ? 1 : 0;
      const by = y.boost && new Date(y.boost.jusquAu) > new Date() ? 1 : 0;
      if (bx !== by) return by - bx;
      return new Date(y.creeLe) - new Date(x.creeLe);
    });
    send(c.res, 200, list.map((a) => annonceVue(a, c.user)));
  }],

  ['GET', /^\/api\/annonces\/mes$/, (c) => {
    if (!c.user || c.user.role !== 'bailleur') return send(c.res, 403, { error: 'Accès bailleur uniquement' });
    const list = db.annonces.filter((a) => a.bailleurId === c.user.id).sort((x, y) => new Date(y.creeLe) - new Date(x.creeLe));
    send(c.res, 200, list.map((a) => annonceVue(a, c.user)));
  }],

  ['POST', /^\/api\/annonces$/, (c) => {
    if (!c.user || c.user.role !== 'bailleur') return send(c.res, 403, { error: 'Accès bailleur uniquement' });
    const { titre, type, quartier, prix, description, photo } = c.body;
    if (!titre || !TYPES.includes(type) || !QUARTIERS.includes(quartier) || !Number(prix)) {
      return send(c.res, 400, { error: 'Informations de l\'annonce invalides' });
    }
    const a = {
      id: nid(), bailleurId: c.user.id, titre, type, quartier, prix: Number(prix),
      photo: photo || 'room1', description: description || '', statut: 'en_attente',
      creeLe: new Date().toISOString(), boost: null
    };
    db.annonces.push(a);
    ev(`Nouvelle annonce à valider : ${titre}`);
    save();
    send(c.res, 201, annonceVue(a, c.user));
  }],

  ['GET', /^\/api\/annonces\/(\d+)$/, (c) => {
    const a = findAnnonce(Number(c.m[1]));
    if (!a) return send(c.res, 404, { error: 'Annonce introuvable' });
    const owner = c.user && (c.user.id === a.bailleurId || c.user.role === 'admin');
    if (a.statut !== 'approuvee' && !owner) return send(c.res, 404, { error: 'Annonce introuvable' });
    const avis = db.avis.filter((v) => v.annonceId === a.id).map((v) => ({ ...v, etudiant: pubUser(findUser(v.etudiantId)) }));
    send(c.res, 200, { ...annonceVue(a, c.user), avis });
  }],

  ['PATCH', /^\/api\/annonces\/(\d+)\/statut$/, (c) => {
    if (!c.user || c.user.role !== 'admin') return send(c.res, 403, { error: 'Accès admin uniquement' });
    const a = findAnnonce(Number(c.m[1]));
    if (!a) return send(c.res, 404, { error: 'Annonce introuvable' });
    const { statut } = c.body;
    if (!['approuvee', 'rejectee', 'en_attente'].includes(statut)) return send(c.res, 400, { error: 'Statut invalide' });
    a.statut = statut;
    ev(`Annonce ${statut === 'approuvee' ? 'approuvée' : statut === 'rejectee' ? 'rejetée' : 'réouverte'} : ${a.titre}`);
    save();
    send(c.res, 200, annonceVue(a, c.user));
  }],

  ['POST', /^\/api\/annonces\/(\d+)\/boost$/, (c) => {
    if (!c.user || c.user.role !== 'bailleur') return send(c.res, 403, { error: 'Accès bailleur uniquement' });
    const a = findAnnonce(Number(c.m[1]));
    if (!a || a.bailleurId !== c.user.id) return send(c.res, 404, { error: 'Annonce introuvable' });
    const { formule, jours, mode } = c.body;
    if (!FORMULES[formule] || !Number(jours) || !mode) return send(c.res, 400, { error: 'Formule invalide' });
    const montant = FORMULES[formule] * Number(jours);
    db.paiements.push({
      id: nid(), annonceId: a.id, bailleurId: c.user.id, formule,
      jours: Number(jours), montant, mode, date: new Date().toISOString()
    });
    a.boost = { formule, jours: Number(jours), jusquAu: new Date(Date.now() + Number(jours) * 86400000).toISOString() };
    ev(`Paiement boost ${formule} (${montant.toLocaleString('fr-FR')} FCFA) : ${a.titre}`);
    save();
    send(c.res, 200, { paiement: db.paiements[db.paiements.length - 1], annonce: annonceVue(a, c.user) });
  }],

  ['GET', /^\/api\/favoris$/, (c) => {
    if (!c.user || c.user.role !== 'etudiant') return send(c.res, 403, { error: 'Accès étudiant uniquement' });
    const list = db.favoris.filter((f) => f.etudiantId === c.user.id)
      .map((f) => findAnnonce(f.annonceId)).filter(Boolean)
      .map((a) => annonceVue(a, c.user));
    send(c.res, 200, list);
  }],

  ['POST', /^\/api\/favoris$/, (c) => {
    if (!c.user || c.user.role !== 'etudiant') return send(c.res, 403, { error: 'Accès étudiant uniquement' });
    const annonceId = Number(c.body.annonceId);
    if (!findAnnonce(annonceId)) return send(c.res, 404, { error: 'Annonce introuvable' });
    const idx = db.favoris.findIndex((f) => f.etudiantId === c.user.id && f.annonceId === annonceId);
    if (idx >= 0) db.favoris.splice(idx, 1);
    else db.favoris.push({ id: nid(), etudiantId: c.user.id, annonceId });
    save();
    send(c.res, 200, { favori: idx < 0 });
  }],

  ['GET', /^\/api\/visites$/, (c) => {
    if (!c.user) return send(c.res, 401, { error: 'Non connecté' });
    let list;
    if (c.user.role === 'etudiant') list = db.visites.filter((v) => v.etudiantId === c.user.id);
    else if (c.user.role === 'bailleur') {
      const ids = db.annonces.filter((a) => a.bailleurId === c.user.id).map((a) => a.id);
      list = db.visites.filter((v) => ids.includes(v.annonceId));
    } else list = db.visites.slice();
    list = list.sort((x, y) => (x.date + x.heure).localeCompare(y.date + y.heure)).map((v) => ({
      ...v,
      annonce: findAnnonce(v.annonceId),
      etudiant: pubUser(findUser(v.etudiantId))
    }));
    send(c.res, 200, list);
  }],

  ['POST', /^\/api\/visites$/, (c) => {
    if (!c.user || c.user.role !== 'etudiant') return send(c.res, 403, { error: 'Accès étudiant uniquement' });
    const a = findAnnonce(Number(c.body.annonceId));
    if (!a || !c.body.date || !c.body.heure) return send(c.res, 400, { error: 'Date et heure requises' });
    const v = { id: nid(), etudiantId: c.user.id, annonceId: a.id, date: c.body.date, heure: c.body.heure, statut: 'en_attente' };
    db.visites.push(v);
    ev(`Demande de visite : ${c.user.prenom} ${c.user.nom} → ${a.titre}`);
    save();
    send(c.res, 201, v);
  }],

  ['PATCH', /^\/api\/visites\/(\d+)\/statut$/, (c) => {
    if (!c.user) return send(c.res, 401, { error: 'Non connecté' });
    const v = db.visites.find((x) => x.id === Number(c.m[1]));
    if (!v) return send(c.res, 404, { error: 'Visite introuvable' });
    const a = findAnnonce(v.annonceId);
    const isBailleur = c.user.role === 'bailleur' && a && a.bailleurId === c.user.id;
    const isEtudiant = c.user.role === 'etudiant' && v.etudiantId === c.user.id;
    if (!isBailleur && !isEtudiant) return send(c.res, 403, { error: 'Non autorisé' });
    const { statut } = c.body;
    if (isBailleur && !['confirmee', 'annulee', 'en_attente'].includes(statut)) return send(c.res, 400, { error: 'Statut invalide' });
    if (isEtudiant && statut !== 'annulee') return send(c.res, 403, { error: 'Un étudiant ne peut qu\'annuler' });
    v.statut = statut;
    save();
    send(c.res, 200, v);
  }],

  ['GET', /^\/api\/conversations$/, (c) => {
    if (!c.user) return send(c.res, 401, { error: 'Non connecté' });
    const ids = [...new Set(db.messages.filter((m) => m.fromId === c.user.id || m.toId === c.user.id)
      .map((m) => (m.fromId === c.user.id ? m.toId : m.fromId)))];
    const list = ids.map((id) => {
      const thread = db.messages.filter((m) => (m.fromId === c.user.id && m.toId === id) || (m.fromId === id && m.toId === c.user.id))
        .sort((x, y) => new Date(x.date) - new Date(y.date));
      return {
        user: pubUser(findUser(id)),
        dernier: thread[thread.length - 1],
        nonLu: thread.filter((m) => m.toId === c.user.id && !m.lu).length
      };
    }).sort((x, y) => new Date(y.dernier.date) - new Date(x.dernier.date));
    send(c.res, 200, list);
  }],

  ['GET', /^\/api\/messages$/, (c) => {
    if (!c.user) return send(c.res, 401, { error: 'Non connecté' });
    const avec = Number(c.query.avec);
    const thread = db.messages.filter((m) => (m.fromId === c.user.id && m.toId === avec) || (m.fromId === avec && m.toId === c.user.id))
      .sort((x, y) => new Date(x.date) - new Date(y.date));
    thread.forEach((m) => { if (m.toId === c.user.id) m.lu = true; });
    save();
    send(c.res, 200, thread);
  }],

  ['POST', /^\/api\/messages$/, (c) => {
    if (!c.user) return send(c.res, 401, { error: 'Non connecté' });
    const toId = Number(c.body.toId);
    if (!findUser(toId) || !c.body.texte) return send(c.res, 400, { error: 'Destinataire et message requis' });
    const m = {
      id: nid(), fromId: c.user.id, toId, annonceId: c.body.annonceId || null,
      texte: c.body.texte, lu: false, date: new Date().toISOString()
    };
    db.messages.push(m);
    save();
    send(c.res, 201, m);
  }],

  ['POST', /^\/api\/avis$/, (c) => {
    if (!c.user || c.user.role !== 'etudiant') return send(c.res, 403, { error: 'Accès étudiant uniquement' });
    const a = findAnnonce(Number(c.body.annonceId));
    const note = Number(c.body.note);
    if (!a || note < 1 || note > 5) return send(c.res, 400, { error: 'Avis invalide' });
    const v = { id: nid(), annonceId: a.id, etudiantId: c.user.id, note, texte: c.body.texte || '', date: new Date().toISOString() };
    db.avis.push(v);
    save();
    send(c.res, 201, v);
  }],

  ['GET', /^\/api\/admin\/annonces$/, (c) => {
    if (!c.user || c.user.role !== 'admin') return send(c.res, 403, { error: 'Accès admin uniquement' });
    let list = db.annonces.slice().sort((x, y) => new Date(y.creeLe) - new Date(x.creeLe));
    if (c.query.statut) list = list.filter((a) => a.statut === c.query.statut);
    send(c.res, 200, list.map((a) => annonceVue(a, c.user)));
  }],

  ['GET', /^\/api\/admin\/stats$/, (c) => {
    if (!c.user || c.user.role !== 'admin') return send(c.res, 403, { error: 'Accès admin uniquement' });
    send(c.res, 200, {
      actives: db.annonces.filter((a) => a.statut === 'approuvee').length,
      enAttente: db.annonces.filter((a) => a.statut === 'en_attente').length,
      rejectees: db.annonces.filter((a) => a.statut === 'rejectee').length,
      utilisateurs: db.users.length,
      etudiants: db.users.filter((u) => u.role === 'etudiant').length,
      bailleurs: db.users.filter((u) => u.role === 'bailleur').length,
      revenus: db.paiements.reduce((s, p) => s + p.montant, 0),
      visites: db.visites.length,
      evenements: db.evenements.slice(-8).reverse()
    });
  }],

  ['GET', /^\/api\/admin\/utilisateurs$/, (c) => {
    if (!c.user || c.user.role !== 'admin') return send(c.res, 403, { error: 'Accès admin uniquement' });
    send(c.res, 200, db.users.map(pubUser).sort((x, y) => new Date(y.creeLe) - new Date(x.creeLe)));
  }],

  ['GET', /^\/api\/admin\/paiements$/, (c) => {
    if (!c.user || c.user.role !== 'admin') return send(c.res, 403, { error: 'Accès admin uniquement' });
    send(c.res, 200, db.paiements.slice().reverse().map((p) => ({
      ...p, annonce: findAnnonce(p.annonceId), bailleur: pubUser(findUser(p.bailleurId))
    })));
  }],

  ['GET', /^\/api\/admin\/avis$/, (c) => {
    if (!c.user || c.user.role !== 'admin') return send(c.res, 403, { error: 'Accès admin uniquement' });
    send(c.res, 200, db.avis.slice().reverse().map((v) => ({
      ...v, annonce: findAnnonce(v.annonceId), etudiant: pubUser(findUser(v.etudiantId))
    })));
  }],

  ['GET', /^\/api\/admin\/evenements$/, (c) => {
    if (!c.user || c.user.role !== 'admin') return send(c.res, 403, { error: 'Accès admin uniquement' });
    send(c.res, 200, db.evenements.slice().reverse());
  }],

  ['GET', /^\/api\/admin\/messages$/, (c) => {
    if (!c.user || c.user.role !== 'admin') return send(c.res, 403, { error: 'Accès admin uniquement' });
    send(c.res, 200, db.messages.slice().reverse().map((m) => ({
      ...m, from: pubUser(findUser(m.fromId)), to: pubUser(findUser(m.toId))
    })));
  }],

  ['GET', /^\/api\/admin\/quartiers$/, (c) => {
    if (!c.user || c.user.role !== 'admin') return send(c.res, 403, { error: 'Accès admin uniquement' });
    const actives = db.annonces.filter((a) => a.statut === 'approuvee');
    send(c.res, 200, QUARTIERS.map((q) => {
      const list = actives.filter((a) => a.quartier === q);
      return {
        quartier: q,
        annonces: list.length,
        prixMoyen: list.length ? Math.round(list.reduce((s, a) => s + a.prix, 0) / list.length) : 0
      };
    }));
  }],

  ['GET', /^\/api\/admin\/prix$/, (c) => {
    if (!c.user || c.user.role !== 'admin') return send(c.res, 403, { error: 'Accès admin uniquement' });
    const actives = db.annonces.filter((a) => a.statut === 'approuvee');
    send(c.res, 200, TYPES.map((t) => {
      const list = actives.filter((a) => a.type === t);
      const prix = list.map((a) => a.prix);
      return {
        type: t, annonces: list.length,
        min: prix.length ? Math.min(...prix) : 0,
        max: prix.length ? Math.max(...prix) : 0,
        moyen: prix.length ? Math.round(prix.reduce((s, p) => s + p, 0) / prix.length) : 0
      };
    }));
  }]
];

function serveStatic(res, urlPath) {
  let p = decodeURIComponent(urlPath);
  if (p === '/') p = '/index.html';
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (!url.pathname.startsWith('/api/')) return serveStatic(res, url.pathname);
  const body = ['POST', 'PATCH', 'PUT'].includes(req.method) ? await readBody(req) : {};
  const user = auth(req);
  for (const [method, regex, handler] of routes) {
    if (method !== req.method) continue;
    const m = url.pathname.match(regex);
    if (!m) continue;
    try {
      return handler({ req, res, m, body, user, query: Object.fromEntries(url.searchParams) });
    } catch (e) {
      console.error(e);
      return send(res, 500, { error: 'Erreur serveur' });
    }
  }
  send(res, 404, { error: 'Route introuvable' });
});

server.listen(PORT, () => console.log(`Tanal Sa Logement démarré sur http://localhost:${PORT}`));

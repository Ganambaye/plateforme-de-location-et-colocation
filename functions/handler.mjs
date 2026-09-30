// Tanal Sa Logement - portage de l'API Node vers la Function Edge (Supabase)
const json = (body, status = 200) => Response.json(body, {
  status,
  headers: { 'cache-control': 'no-store' }
});

const TYPES = ['Studio', 'Chambre', 'Appartement', 'Colocation'];
const QUARTIERS = ['Almadies', 'Yoff', 'Sacré-Cœur', 'Point E', 'Ouakam', 'Mermoz', 'Grand Yoff', 'Dakar Plateau', 'Fann', 'Médina'];
const FORMULES = { premium: 5000, standard: 2500, basic: 1000 };
const iso = () => new Date().toISOString();

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function bodyOf(request) {
  const raw = await request.text().catch(() => '');
  if (raw.length > 100000) return null;
  try { return raw ? JSON.parse(raw) : {}; } catch { return null; }
}

// L'adaptateur officiel supprime l'en-tête authorization entrant ; le jeton de
// session circule donc via un en-tête applicatif.
const getToken = (request) => request.headers.get('x-tanal-token') || '';

const pubUser = (u) => u && {
  id: u.id, nom: u.nom, prenom: u.prenom, email: u.email, role: u.role,
  telephone: u.telephone, whatsapp: u.whatsapp, creeLe: u.cree_le
};

const pubMessage = (m) => m && {
  id: m.id, fromId: m.from_id, toId: m.to_id, annonceId: m.annonce_id,
  texte: m.texte, lu: m.lu, date: m.date
};

async function currentUser(supabase, token) {
  if (!token) return null;
  const { data: s, error } = await supabase.from('sessions').select('user_id').eq('token', token).maybeSingle();
  if (error || !s) return null;
  const { data: u } = await supabase.from('users').select('*').eq('id', s.user_id).maybeSingle();
  return u || null;
}

async function nonLus(supabase, userId) {
  const { count, error } = await supabase.from('messages').select('id', { count: 'exact' })
    .eq('to_id', userId).eq('lu', false).limit(1);
  return error || !Number.isSafeInteger(count) ? 0 : count;
}

async function usersMap(supabase, ids) {
  const uniq = [...new Set(ids)].filter(Boolean);
  const map = {};
  if (!uniq.length) return map;
  const { data, error } = await supabase.from('users').select('*').in('id', uniq);
  if (error || !Array.isArray(data)) throw new Error('db');
  for (const u of data) map[u.id] = u;
  return map;
}

async function favorisSet(supabase, etudiantId) {
  const { data } = await supabase.from('favoris').select('annonce_id').eq('etudiant_id', etudiantId);
  return new Set((data || []).map((f) => f.annonce_id));
}

function vue(a, umap, favSet) {
  return {
    id: a.id, titre: a.titre, type: a.type, quartier: a.quartier, prix: a.prix, photo: a.photo,
    description: a.description, statut: a.statut, creeLe: a.cree_le, boost: a.boost,
    bailleurId: a.bailleur_id,
    bailleur: pubUser(umap[a.bailleur_id] || null),
    boostActif: !!(a.boost && new Date(a.boost.jusquAu) > new Date()),
    favori: favSet ? favSet.has(a.id) : false
  };
}

async function addEvent(supabase, texte) {
  await supabase.from('evenements').insert({ id: crypto.randomUUID(), texte, date: iso() });
}

export async function handleApp({ request, supabase }) {
  try {
    const path = new URL(request.url).pathname;
    const method = request.method;
    const token = getToken(request);
    const user = await currentUser(supabase, token);

    const need = (role) => {
      if (!user) return json({ error: 'Non connecté' }, 401);
      if (role && user.role !== role) return json({ error: 'Accès refusé' }, 403);
      return null;
    };
    const body = () => bodyOf(request);

    // ---------- ROUTES ----------
    // Le bloc admin est en premier : /admin/annonces et /admin/messages doivent
    // matcher ici, pas les routes publiques suffixées /annonces et /messages.
    const routes = [
      [['GET'], /\/admin\/(stats|annonces|utilisateurs|paiements|avis|evenements|messages|quartiers|prix)$/, async (mm) => {
        if (need('admin')) return need('admin');
        const section = mm[1];
        if (section === 'stats') {
          const cnt = async (t, ...filters) => {
            let q = supabase.from(t).select('id', { count: 'exact' });
            for (let i = 0; i < filters.length; i += 2) q = q.eq(filters[i], filters[i + 1]);
            const { count, error } = await q.limit(1);
            if (error || !Number.isSafeInteger(count)) throw new Error('db');
            return count;
          };
          const [actives, enAttente, utilisateurs, visites] = await Promise.all([
            cnt('annonces', 'statut', 'approuvee'),
            cnt('annonces', 'statut', 'en_attente'),
            cnt('users'),
            cnt('visites')
          ]);
          const { data: ps, error: e2 } = await supabase.from('paiements').select('montant');
          if (e2) throw new Error('db');
          const { data: evs, error: e3 } = await supabase.from('evenements').select('*').order('date', { ascending: false }).limit(8);
          if (e3) throw new Error('db');
          return json({
            actives, enAttente, rejectees: 0, utilisateurs,
            etudiants: 0, bailleurs: 0,
            revenus: (ps || []).reduce((s, p) => s + p.montant, 0),
            visites, evenements: evs || []
          });
        }
        if (section === 'annonces') {
          const statut = new URL(request.url).searchParams.get('statut');
          let q = supabase.from('annonces').select('*');
          if (statut) q = q.eq('statut', statut);
          const { data, error } = await q;
          if (error) throw new Error('db');
          const list = (data || []).sort((x, y) => new Date(y.cree_le) - new Date(x.cree_le));
          const umap = await usersMap(supabase, list.map((a) => a.bailleur_id));
          return json(list.map((a) => vue(a, umap, null)));
        }
        if (section === 'utilisateurs') {
          const { data, error } = await supabase.from('users').select('*');
          if (error) throw new Error('db');
          return json((data || []).sort((x, y) => new Date(y.cree_le) - new Date(x.cree_le)).map(pubUser));
        }
        if (section === 'paiements') {
          const { data, error } = await supabase.from('paiements').select('*');
          if (error) throw new Error('db');
          const list = (data || []).sort((x, y) => new Date(y.date) - new Date(x.date));
          const umap = await usersMap(supabase, list.map((p) => p.bailleur_id));
          const { data: anns } = await supabase.from('annonces').select('*').in('id', [...new Set(list.map((p) => p.annonce_id))]);
          const amap = {};
          for (const a of (anns || [])) amap[a.id] = a;
          return json(list.map((p) => ({ ...p, annonce: amap[p.annonce_id] || null, bailleur: pubUser(umap[p.bailleur_id] || null) })));
        }
        if (section === 'avis') {
          const { data, error } = await supabase.from('avis').select('*');
          if (error) throw new Error('db');
          const list = (data || []).sort((x, y) => new Date(y.date) - new Date(x.date));
          const umap = await usersMap(supabase, list.map((v) => v.etudiant_id));
          const { data: anns } = await supabase.from('annonces').select('*').in('id', [...new Set(list.map((v) => v.annonce_id))]);
          const amap = {};
          for (const a of (anns || [])) amap[a.id] = a;
          return json(list.map((v) => ({ ...v, annonce: amap[v.annonce_id] || null, etudiant: pubUser(umap[v.etudiant_id] || null) })));
        }
        if (section === 'evenements') {
          const { data, error } = await supabase.from('evenements').select('*');
          if (error) throw new Error('db');
          return json((data || []).sort((x, y) => new Date(y.date) - new Date(x.date)));
        }
        if (section === 'messages') {
          const { data, error } = await supabase.from('messages').select('*');
          if (error) throw new Error('db');
          const list = (data || []).sort((x, y) => new Date(y.date) - new Date(x.date));
          const umap = await usersMap(supabase, [...new Set([...list.map((m) => m.from_id), ...list.map((m) => m.to_id)])]);
          return json(list.map((m) => ({ ...pubMessage(m), from: pubUser(umap[m.from_id] || null), to: pubUser(umap[m.to_id] || null) })));
        }
        if (section === 'quartiers') {
          const { data, error } = await supabase.from('annonces').select('*').eq('statut', 'approuvee');
          if (error) throw new Error('db');
          const actives = data || [];
          return json(QUARTIERS.map((q) => {
            const list = actives.filter((a) => a.quartier === q);
            return {
              quartier: q, annonces: list.length,
              prixMoyen: list.length ? Math.round(list.reduce((s, a) => s + a.prix, 0) / list.length) : 0
            };
          }));
        }
        if (section === 'prix') {
          const { data, error } = await supabase.from('annonces').select('*').eq('statut', 'approuvee');
          if (error) throw new Error('db');
          const actives = data || [];
          return json(TYPES.map((t) => {
            const list = actives.filter((a) => a.type === t);
            const prix = list.map((a) => a.prix);
            return {
              type: t, annonces: list.length,
              min: prix.length ? Math.min(...prix) : 0,
              max: prix.length ? Math.max(...prix) : 0,
              moyen: prix.length ? Math.round(prix.reduce((s, p) => s + p, 0) / prix.length) : 0
            };
          }));
        }
        return json({ error: 'route_introuvable' }, 404);
      }],

      [['POST'], /\/inscription$/, async () => {
        const b = await body();
        if (!b || !['etudiant', 'bailleur'].includes(b.role) || !b.nom || !b.prenom || !b.email || !b.password) {
          return json({ error: 'Champs obligatoires manquants' }, 400);
        }
        const email = String(b.email).toLowerCase();
        const { data: exists } = await supabase.from('users').select('id').eq('email', email).limit(1);
        if (exists && exists.length) return json({ error: 'Un compte existe déjà avec cet email' }, 400);
        const u = {
          id: crypto.randomUUID(), nom: b.nom, prenom: b.prenom, email, mdp: await sha256(b.password),
          role: b.role, telephone: b.telephone || '', whatsapp: b.whatsapp || '', cree_le: iso()
        };
        const { error } = await supabase.from('users').insert(u);
        if (error) throw new Error('db');
        const tok = crypto.randomUUID() + crypto.randomUUID();
        await supabase.from('sessions').insert({ token: tok, user_id: u.id, cree_le: iso() });
        await addEvent(supabase, `Nouvelle inscription ${b.role} : ${b.prenom} ${b.nom}`);
        return json({ token: tok, user: pubUser(u) }, 201);
      }],

      [['POST'], /\/connexion$/, async () => {
        const b = await body();
        if (!b || !b.email || !b.password) return json({ error: 'Email et mot de passe requis' }, 400);
        const { data: u } = await supabase.from('users').select('*')
          .eq('email', String(b.email).toLowerCase()).maybeSingle();
        if (!u || u.mdp !== await sha256(String(b.password))) {
          return json({ error: 'Email ou mot de passe incorrect' }, 401);
        }
        const tok = crypto.randomUUID() + crypto.randomUUID();
        await supabase.from('sessions').insert({ token: tok, user_id: u.id, cree_le: iso() });
        return json({ token: tok, user: pubUser(u) });
      }],

      [['GET'], /\/me$/, async () => {
        if (need()) return need();
        return json({ ...pubUser(user), nonLus: await nonLus(supabase, user.id) });
      }],

      [['POST'], /\/deconnexion$/, async () => {
        await supabase.from('sessions').delete().eq('token', token);
        return json({ ok: true });
      }],

      [['GET'], /\/meta$/, () => json({
        types: TYPES, quartiers: QUARTIERS,
        prixMax: [50000, 75000, 100000, 150000, 250000], formules: FORMULES
      })],

      [['POST'], /\/seed$/, async () => {
        const { count } = await supabase.from('users').select('id', { count: 'exact' }).limit(1);
        if (count && count > 0) return json({ error: 'Déjà initialisé' }, 409);
        await seedDemo(supabase);
        return json({ ok: true });
      }],

      [['GET'], /\/annonces\/mes$/, async () => {
        if (need('bailleur')) return need('bailleur');
        const { data, error } = await supabase.from('annonces').select('*').eq('bailleur_id', user.id);
        if (error) throw new Error('db');
        const list = (data || []).sort((x, y) => new Date(y.cree_le) - new Date(x.cree_le));
        const umap = await usersMap(supabase, list.map((a) => a.bailleur_id));
        return json(list.map((a) => vue(a, umap, null)));
      }],

      [['PATCH'], /\/annonces\/([^/]+)\/statut$/, async (mm) => {
        if (need('admin')) return need('admin');
        const b = await body();
        if (!b || !['approuvee', 'rejectee', 'en_attente'].includes(b.statut)) {
          return json({ error: 'Statut invalide' }, 400);
        }
        const { data: a, error } = await supabase.from('annonces').select('*').eq('id', mm[1]).maybeSingle();
        if (error || !a) return json({ error: 'Annonce introuvable' }, 404);
        const { error: err2 } = await supabase.from('annonces').update({ statut: b.statut }).eq('id', a.id);
        if (err2) throw new Error('db');
        await addEvent(supabase, `Annonce ${b.statut === 'approuvee' ? 'approuvée' : b.statut === 'rejectee' ? 'rejetée' : 'réouverte'} : ${a.titre}`);
        const umap = await usersMap(supabase, [a.bailleur_id]);
        return json(vue({ ...a, statut: b.statut }, umap, null));
      }],

      [['POST'], /\/annonces\/([^/]+)\/boost$/, async (mm) => {
        if (need('bailleur')) return need('bailleur');
        const b = await body();
        if (!b || !FORMULES[b.formule] || !Number(b.jours) || !b.mode) {
          return json({ error: 'Formule invalide' }, 400);
        }
        const { data: a, error } = await supabase.from('annonces').select('*').eq('id', mm[1]).maybeSingle();
        if (error || !a || a.bailleur_id !== user.id) return json({ error: 'Annonce introuvable' }, 404);
        const jours = Number(b.jours);
        const montant = FORMULES[b.formule] * jours;
        const paiement = {
          id: crypto.randomUUID(), annonce_id: a.id, bailleur_id: user.id, formule: b.formule,
          jours, montant, mode: b.mode, date: iso()
        };
        await supabase.from('paiements').insert(paiement);
        const boost = { formule: b.formule, jours, jusquAu: new Date(Date.now() + jours * 86400000).toISOString() };
        const { error: err2 } = await supabase.from('annonces').update({ boost }).eq('id', a.id);
        if (err2) throw new Error('db');
        await addEvent(supabase, `Paiement boost ${b.formule} (${montant.toLocaleString('fr-FR')} FCFA) : ${a.titre}`);
        const umap = await usersMap(supabase, [a.bailleur_id]);
        return json({ paiement, annonce: vue({ ...a, boost }, umap, null) });
      }],

      [['GET'], /\/annonces\/([^/]+)$/, async (mm) => {
        const { data: a, error } = await supabase.from('annonces').select('*').eq('id', mm[1]).maybeSingle();
        if (error || !a) return json({ error: 'Annonce introuvable' }, 404);
        const owner = user && (user.id === a.bailleur_id || user.role === 'admin');
        if (a.statut !== 'approuvee' && !owner) return json({ error: 'Annonce introuvable' }, 404);
        const umap = await usersMap(supabase, [a.bailleur_id]);
        const fav = user && user.role === 'etudiant' ? await favorisSet(supabase, user.id) : null;
        const { data: avis, error: e2 } = await supabase.from('avis').select('*').eq('annonce_id', a.id);
        if (e2) throw new Error('db');
        const eumap = await usersMap(supabase, (avis || []).map((v) => v.etudiant_id));
        return json({
          ...vue(a, umap, fav),
          avis: (avis || []).map((v) => ({ id: v.id, note: v.note, texte: v.texte, date: v.date, etudiant: pubUser(eumap[v.etudiant_id] || null) }))
        });
      }],

      [['GET'], /\/annonces$/, async () => {
        const q = new URL(request.url).searchParams;
        const { data, error } = await supabase.from('annonces').select('*').eq('statut', 'approuvee');
        if (error) throw new Error('db');
        let list = data || [];
        if (q.get('type')) list = list.filter((a) => a.type === q.get('type'));
        if (q.get('quartier')) list = list.filter((a) => a.quartier === q.get('quartier'));
        if (q.get('prixMax')) list = list.filter((a) => a.prix <= Number(q.get('prixMax')));
        if (q.get('q')) {
          const s = q.get('q').toLowerCase();
          list = list.filter((a) => (a.titre + ' ' + a.quartier).toLowerCase().includes(s));
        }
        list.sort((x, y) => {
          const bx = x.boost && new Date(x.boost.jusquAu) > new Date() ? 1 : 0;
          const by = y.boost && new Date(y.boost.jusquAu) > new Date() ? 1 : 0;
          if (bx !== by) return by - bx;
          return new Date(y.cree_le) - new Date(x.cree_le);
        });
        const umap = await usersMap(supabase, list.map((a) => a.bailleur_id));
        const fav = user && user.role === 'etudiant' ? await favorisSet(supabase, user.id) : null;
        return json(list.map((a) => vue(a, umap, fav)));
      }],

      [['POST'], /\/annonces$/, async () => {
        if (need('bailleur')) return need('bailleur');
        const b = await body();
        if (!b || !b.titre || !TYPES.includes(b.type) || !QUARTIERS.includes(b.quartier) || !Number(b.prix)) {
          return json({ error: 'Informations de l\'annonce invalides' }, 400);
        }
        const a = {
          id: crypto.randomUUID(), bailleur_id: user.id, titre: b.titre, type: b.type, quartier: b.quartier,
          prix: Number(b.prix), photo: b.photo || 'room1', description: b.description || '',
          statut: 'en_attente', cree_le: iso(), boost: null
        };
        const { error } = await supabase.from('annonces').insert(a);
        if (error) throw new Error('db');
        await addEvent(supabase, `Nouvelle annonce à valider : ${a.titre}`);
        const umap = await usersMap(supabase, [a.bailleur_id]);
        return json(vue(a, umap, null), 201);
      }],

      [['GET'], /\/favoris$/, async () => {
        if (need('etudiant')) return need('etudiant');
        const { data, error } = await supabase.from('favoris').select('annonce_id').eq('etudiant_id', user.id);
        if (error) throw new Error('db');
        const ids = (data || []).map((f) => f.annonce_id);
        if (!ids.length) return json([]);
        const { data: list, error: e2 } = await supabase.from('annonces').select('*').in('id', ids);
        if (e2) throw new Error('db');
        const umap = await usersMap(supabase, list.map((a) => a.bailleur_id));
        return json((list || []).map((a) => vue(a, umap, new Set(ids))));
      }],

      [['POST'], /\/favoris$/, async () => {
        if (need('etudiant')) return need('etudiant');
        const b = await body();
        if (!b || !b.annonceId) return json({ error: 'Annonce requise' }, 400);
        const { data: a } = await supabase.from('annonces').select('id').eq('id', String(b.annonceId)).maybeSingle();
        if (!a) return json({ error: 'Annonce introuvable' }, 404);
        const { data: exists } = await supabase.from('favoris').select('id')
          .eq('etudiant_id', user.id).eq('annonce_id', a.id).limit(1);
        if (exists && exists.length) {
          await supabase.from('favoris').delete().eq('etudiant_id', user.id).eq('annonce_id', a.id);
          return json({ favori: false });
        }
        await supabase.from('favoris').insert({ id: crypto.randomUUID(), etudiant_id: user.id, annonce_id: a.id });
        return json({ favori: true });
      }],

      [['GET'], /\/visites$/, async () => {
        if (need()) return need();
        let list;
        if (user.role === 'etudiant') {
          const { data, error } = await supabase.from('visites').select('*').eq('etudiant_id', user.id);
          if (error) throw new Error('db');
          list = data || [];
        } else if (user.role === 'bailleur') {
          const { data: anns, error } = await supabase.from('annonces').select('id').eq('bailleur_id', user.id);
          if (error) throw new Error('db');
          const ids = (anns || []).map((a) => a.id);
          list = ids.length ? ((await supabase.from('visites').select('*').in('annonce_id', ids)).data || []) : [];
        } else {
          const { data, error } = await supabase.from('visites').select('*');
          if (error) throw new Error('db');
          list = data || [];
        }
        list.sort((x, y) => (x.date + x.heure).localeCompare(y.date + y.heure));
        const umap = await usersMap(supabase, [...list.map((v) => v.etudiant_id), ...list.map((v) => (null))]);
        const amap = {};
        const { data: anns } = await supabase.from('annonces').select('*').in('id', [...new Set(list.map((v) => v.annonce_id))]);
        for (const a of (anns || [])) amap[a.id] = a;
        return json(list.map((v) => ({ ...v, annonce: amap[v.annonce_id] || null, etudiant: pubUser(umap[v.etudiant_id] || null) })));
      }],

      [['POST'], /\/visites$/, async () => {
        if (need('etudiant')) return need('etudiant');
        const b = await body();
        if (!b || !b.annonceId || !/^\d{4}-\d{2}-\d{2}$/.test(String(b.date)) || !/^\d{2}:\d{2}$/.test(String(b.heure))) {
          return json({ error: 'Date et heure requises' }, 400);
        }
        const { data: a } = await supabase.from('annonces').select('id,titre').eq('id', String(b.annonceId)).maybeSingle();
        if (!a) return json({ error: 'Annonce introuvable' }, 404);
        const v = { id: crypto.randomUUID(), etudiant_id: user.id, annonce_id: a.id, date: b.date, heure: b.heure, statut: 'en_attente' };
        await supabase.from('visites').insert(v);
        await addEvent(supabase, `Demande de visite : ${user.prenom} ${user.nom} → ${a.titre}`);
        return json(v, 201);
      }],

      [['PATCH'], /\/visites\/([^/]+)\/statut$/, async (mm) => {
        if (need()) return need();
        const { data: v, error } = await supabase.from('visites').select('*').eq('id', mm[1]).maybeSingle();
        if (error || !v) return json({ error: 'Visite introuvable' }, 404);
        const { data: a } = await supabase.from('annonces').select('bailleur_id').eq('id', v.annonce_id).maybeSingle();
        const isBailleur = user.role === 'bailleur' && a && a.bailleur_id === user.id;
        const isEtudiant = user.role === 'etudiant' && v.etudiant_id === user.id;
        if (!isBailleur && !isEtudiant) return json({ error: 'Non autorisé' }, 403);
        const b = await body();
        if (!b || !b.statut) return json({ error: 'Statut requis' }, 400);
        if (isBailleur && !['confirmee', 'annulee', 'en_attente'].includes(b.statut)) return json({ error: 'Statut invalide' }, 400);
        if (isEtudiant && b.statut !== 'annulee') return json({ error: 'Un étudiant ne peut qu\'annuler' }, 403);
        const { error: e2 } = await supabase.from('visites').update({ statut: b.statut }).eq('id', v.id);
        if (e2) throw new Error('db');
        return json({ ...v, statut: b.statut });
      }],

      [['GET'], /\/conversations$/, async () => {
        if (need()) return need();
        const [r1, r2] = await Promise.all([
          supabase.from('messages').select('*').eq('from_id', user.id),
          supabase.from('messages').select('*').eq('to_id', user.id)
        ]);
        if (r1.error || r2.error) throw new Error('db');
        const all = [...(r1.data || []), ...(r2.data || [])];
        const ids = [...new Set(all.map((m) => (m.from_id === user.id ? m.to_id : m.from_id)))];
        const umap = await usersMap(supabase, ids);
        const list = ids.map((id) => {
          const thread = all.filter((m) => (m.from_id === user.id && m.to_id === id) || (m.from_id === id && m.to_id === user.id))
            .sort((x, y) => new Date(x.date) - new Date(y.date));
          return {
            user: pubUser(umap[id] || null),
            dernier: pubMessage(thread[thread.length - 1]),
            nonLu: thread.filter((m) => m.to_id === user.id && !m.lu).length
          };
        }).sort((x, y) => new Date(y.dernier.date) - new Date(x.dernier.date));
        return json(list);
      }],

      [['POST'], /\/messages$/, async () => {
        if (need()) return need();
        const b = await body();
        if (!b || !b.toId || !b.texte) return json({ error: 'Destinataire et message requis' }, 400);
        const { data: to } = await supabase.from('users').select('id').eq('id', String(b.toId)).maybeSingle();
        if (!to) return json({ error: 'Destinataire introuvable' }, 404);
        const m = { id: crypto.randomUUID(), from_id: user.id, to_id: to.id, annonce_id: b.annonceId || null, texte: b.texte, lu: false, date: iso() };
        await supabase.from('messages').insert(m);
        return json(m, 201);
      }],

      [['GET'], /\/messages$/, async () => {
        if (need()) return need();
        const avec = new URL(request.url).searchParams.get('avec');
        if (!avec) return json({ error: 'Destinataire requis' }, 400);
        const [r1, r2] = await Promise.all([
          supabase.from('messages').select('*').eq('from_id', user.id).eq('to_id', avec),
          supabase.from('messages').select('*').eq('from_id', avec).eq('to_id', user.id)
        ]);
        if (r1.error || r2.error) throw new Error('db');
        const thread = [...(r1.data || []), ...(r2.data || [])].sort((x, y) => new Date(x.date) - new Date(y.date));
        await supabase.from('messages').update({ lu: true }).eq('to_id', user.id).eq('from_id', avec).eq('lu', false);
        return json(thread.map(pubMessage));
      }],

      [['POST'], /\/avis$/, async () => {
        if (need('etudiant')) return need('etudiant');
        const b = await body();
        const note = Number(b && b.note);
        if (!b || !b.annonceId || !Number.isInteger(note) || note < 1 || note > 5) {
          return json({ error: 'Avis invalide' }, 400);
        }
        const { data: a } = await supabase.from('annonces').select('id').eq('id', String(b.annonceId)).maybeSingle();
        if (!a) return json({ error: 'Annonce introuvable' }, 404);
        const v = { id: crypto.randomUUID(), annonce_id: a.id, etudiant_id: user.id, note, texte: b.texte || '', date: iso() };
        await supabase.from('avis').insert(v);
        return json(v, 201);
      }]
    ];

    for (const [methods, re, fn] of routes) {
      if (!methods.includes(method)) continue;
      const mm = path.match(re);
      if (!mm) continue;
      return await fn(mm);
    }
    return json({ error: 'Route introuvable' }, 404);
  } catch {
    return json({ error: 'Erreur serveur' }, 503);
  }
}

async function seedDemo(supabase) {
  const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString();
  const dayOnly = (n) => inDays(n).slice(0, 10);

  const users = [
    ['Sall', 'Awa', 'admin@tanal.sn', 'admin123', 'admin', -120],
    ['Mbedji', 'Mady', 'bailleur@tanal.sn', 'bailleur123', 'bailleur', -90],
    ['Ndiaye', 'Aminata', 'aminata@tanal.sn', 'bailleur123', 'bailleur', -80],
    ['Nssame', 'Diop', 'diop@tanal.sn', 'bailleur123', 'bailleur', -60],
    ['Dupont', 'Jean', 'etudiant@tanal.sn', 'etudiant123', 'etudiant', -45],
    ['Diallo', 'Amadou', 'amadou@tanal.sn', 'etudiant123', 'etudiant', -40]
  ];
  const U = [];
  for (const [nom, prenom, email, mdp, role, j] of users) {
    const u = {
      id: crypto.randomUUID(), nom, prenom, email, mdp: await sha256(mdp), role,
      telephone: '+221 77 000 00 00', whatsapp: '+221 77 000 00 00', cree_le: inDays(j)
    };
    U.push(u);
  }
  await supabase.from('users').insert(U);
  const [, mady, aminata, diop, jean, amadou] = U;

  const annonce = (bailleurId, titre, type, quartier, prix, photo, statut, j, boost = null) => ({
    id: crypto.randomUUID(), bailleur_id: bailleurId, titre, type, quartier, prix, photo,
    description: `${titre}. Logement propre et sécurisé, proche des universités et des commodités. Eau et électricité disponibles, quartier calme.`,
    statut, cree_le: inDays(j), boost
  });
  const a1 = annonce(mady.id, 'Studio étudiant meublé - Point E', 'Studio', 'Point E', 85000, 'room1', 'approuvee', -20, { formule: 'premium', jours: 7, jusquAu: inDays(5) });
  const a2 = annonce(aminata.id, 'Chambre indépendante chez l\'habitant - Yoff', 'Chambre', 'Yoff', 45000, 'room3', 'approuvee', -18);
  const a3 = annonce(mady.id, 'Appartement T3 lumineux - Almadies', 'Appartement', 'Almadies', 250000, 'room4', 'approuvee', -16);
  const a4 = annonce(diop.id, 'Studio moderne proche UCAD - Dakar Plateau', 'Studio', 'Dakar Plateau', 95000, 'room1', 'approuvee', -15);
  const a5 = annonce(aminata.id, 'Colocation 3 chambres - Mermoz', 'Colocation', 'Mermoz', 65000, 'room2', 'approuvee', -14, { formule: 'standard', jours: 3, jusquAu: inDays(-2) });
  const a6 = annonce(mady.id, 'Chambre meublée avec salon - Sacré-Cœur', 'Chambre', 'Sacré-Cœur', 75000, 'room3', 'approuvee', -12);
  const a7 = annonce(diop.id, 'Studio neuf cité Keur Gorgui - Ouakam', 'Studio', 'Ouakam', 70000, 'room1', 'approuvee', -10);
  const a8 = annonce(aminata.id, 'Appartement T2 rénové - Fann', 'Appartement', 'Fann', 150000, 'room4', 'approuvee', -8);
  const a9 = annonce(diop.id, 'Chambre étudiante calme - Grand Yoff', 'Chambre', 'Grand Yoff', 40000, 'room3', 'approuvee', -6);
  const annonces = [a1, a2, a3, a4, a5, a6, a7, a8, a9, annonce(mady.id, 'Studio à louer - Médina', 'Studio', 'Médina', 55000, 'room1', 'rejectee', -25)];

  const enAttente = [
    [mady.id, 'Studio meublé avec kitchenette - Mermoz', 'Studio', 'Mermoz', 90000, 'room1'],
    [mady.id, 'Chambre spacieuse proche arrêt bus - Grand Yoff', 'Chambre', 'Grand Yoff', 42000, 'room3'],
    [aminata.id, 'Appartement T2 meublé - Point E', 'Appartement', 'Point E', 180000, 'room4'],
    [aminata.id, 'Colocation 2 chambres étudiantes - Yoff', 'Colocation', 'Yoff', 60000, 'room2'],
    [diop.id, 'Studio neuf avec terrasse - Ouakam', 'Studio', 'Ouakam', 78000, 'room1'],
    [diop.id, 'Chambre indépendante clôturée - Médina', 'Chambre', 'Médina', 38000, 'room3'],
    [mady.id, 'Appartement T3 vue mer - Almadies', 'Appartement', 'Almadies', 300000, 'room4'],
    [aminata.id, 'Studio calme résidence sécurisée - Sacré-Cœur', 'Studio', 'Sacré-Cœur', 88000, 'room1'],
    [diop.id, 'Chambre meublée tout inclus - Fann', 'Chambre', 'Fann', 65000, 'room3'],
    [mady.id, 'Colocation 4 chambres - Dakar Plateau', 'Colocation', 'Dakar Plateau', 70000, 'room2'],
    [aminata.id, 'Studio rénové proche université - Grand Yoff', 'Studio', 'Grand Yoff', 52000, 'room1'],
    [diop.id, 'Appartement T2 familial - Mermoz', 'Appartement', 'Mermoz', 160000, 'room4']
  ];
  enAttente.forEach(([b, titre, type, quartier, prix, photo], i) => {
    annonces.push(annonce(b, titre, type, quartier, prix, photo, 'en_attente', -(i + 1)));
  });
  await supabase.from('annonces').insert(annonces);

  const fav = (a) => ({ id: crypto.randomUUID(), etudiant_id: jean.id, annonce_id: a.id });
  await supabase.from('favoris').insert([fav(a1), fav(a2), fav(a3), fav(a5), fav(a6), fav(a8), fav(a9)]);

  const visite = (etudiantId, a, date, heure, statut) => ({ id: crypto.randomUUID(), etudiant_id: etudiantId, annonce_id: a.id, date, heure, statut });
  await supabase.from('visites').insert([
    visite(jean.id, a1, dayOnly(1), '10:00', 'en_attente'),
    visite(jean.id, a5, dayOnly(2), '10:00', 'en_attente'),
    visite(jean.id, a6, dayOnly(-3), '14:00', 'confirmee'),
    visite(amadou.id, a2, dayOnly(1), '16:00', 'en_attente')
  ]);

  const message = (fromId, toId, a, texte, lu, j) => ({ id: crypto.randomUUID(), from_id: fromId, to_id: toId, annonce_id: a ? a.id : null, texte, lu, date: inDays(j) });
  await supabase.from('messages').insert([
    message(jean.id, mady.id, a1, 'Bonjour, le studio est-il toujours disponible ?', true, -2),
    message(mady.id, jean.id, a1, 'Bonjour Jean, oui le studio est toujours disponible.', false, -1),
    message(mady.id, jean.id, a1, 'Quand souhaitez-vous passer pour une visite ?', false, -1),
    message(amadou.id, aminata.id, a2, 'Bonjour madame, je suis intéressé par la chambre.', true, -3),
    message(aminata.id, amadou.id, a2, 'Bonjour, elle est libre immédiatement.', true, -2)
  ]);

  const paiement = (a, formule, jours, montant, mode, j) => ({ id: crypto.randomUUID(), annonce_id: a.id, bailleur_id: a.bailleur_id, formule, jours, montant, mode, date: inDays(j) });
  await supabase.from('paiements').insert([
    paiement(a1, 'premium', 7, 35000, 'Wave', -2),
    paiement(a5, 'standard', 3, 7500, 'Orange Money', -5)
  ]);

  const avi = (a, etudiantId, note, texte, j) => ({ id: crypto.randomUUID(), annonce_id: a.id, etudiant_id: etudiantId, note, texte, date: inDays(j) });
  await supabase.from('avis').insert([
    avi(a5, jean.id, 5, 'Logement très propre, bailleur réactif.', -7),
    avi(a2, amadou.id, 4, 'Bon rapport qualité-prix, quartier calme.', -5),
    avi(a1, jean.id, 4, 'Studio conforme aux photos.', -3)
  ]);

  const ev = (texte, j) => ({ id: crypto.randomUUID(), texte, date: inDays(j) });
  await supabase.from('evenements').insert([
    ev('Nouvelle inscription bailleur : Nssame Diop', -60),
    ev('Annonce approuvée : Appartement T2 rénové - Fann', -7),
    ev('Paiement boost Premium (35.000 FCFA) : Studio étudiant meublé - Point E', -2),
    ev('12 annonces en attente de validation', -1)
  ]);
}

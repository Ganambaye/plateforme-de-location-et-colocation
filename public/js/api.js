const TOKEN_KEY = 'tanal_token';

// Hébergement Qoder : l'API vit sous /functions/v1/app.
// En local (serveur Node) et sur Vercel : l'API vit sous /api.
const QODER = location.hostname.endsWith('.qoder.website') || location.hostname.endsWith('.qoder.site');
const BASE = QODER ? '/functions/v1/app' : '/api';

const getToken = () => localStorage.getItem(TOKEN_KEY);
const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
const clearToken = () => localStorage.removeItem(TOKEN_KEY);

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (getToken()) {
    // Le serveur Node local lit Authorization ; les Functions hébergées
    // (Qoder, Vercel) lisent x-tanal-token — l'adaptateur Qoder supprime
    // l'en-tête authorization entrant. On envoie donc les deux pour rester
    // compatible avec tous les hébergeurs.
    headers.Authorization = 'Bearer ' + getToken();
    headers['x-tanal-token'] = getToken();
  }
  const p = path.startsWith('/api') ? path.slice(4) : path;
  const res = await fetch(BASE + p, {
    ...opts,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur ' + res.status);
  return data;
}

async function me() {
  try { return await api('/me'); } catch { return null; }
}

async function guard(role) {
  const user = await me();
  if (!user) { location.href = '/connexion.html'; return null; }
  if (role && user.role !== role) { location.href = '/'; return null; }
  return user;
}

async function logout() {
  try { await api('/deconnexion', { method: 'POST' }); } catch {}
  clearToken();
  location.href = '/';
}

function homeFor(role) {
  return role === 'admin' ? '/admin/index.html' : role === 'bailleur' ? '/bailleur/annonces.html' : '/etudiant/dashboard.html';
}

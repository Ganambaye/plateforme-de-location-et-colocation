const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 10v10h14V10"/>',
  list: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h6"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M17.5 14.5c2.5.3 4 2 4 4.5"/>',
  money: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 3v4M16 3v4"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8z"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 19a2 2 0 0 0 4 0"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V6l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
  tag: '<path d="M20 12l-8 8-9-9V4h7z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-6 8-6s8 2 8 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m4 12 5 5L20 7"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.5"/>',
  heart: '<path d="M12 20s-7-4.5-9-9c-1.5-3.5 1-7 4.5-7 2 0 3.5 1 4.5 2.5C13 5 14.5 4 16.5 4 20 4 22.5 7.5 21 11c-2 4.5-9 9-9 9z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  chart: '<path d="M4 20v-8M10 20V4M16 20v-6M2 20h20"/>',
  rocket: '<path d="M12 15c-2-4-1-9 3-12 4 3 5 8 3 12z"/><path d="M12 15l-3 3M18 15l1 4-4-1"/>'
};

function icon(name, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.list}</svg>`;
}

const fmtFCFA = (n) => Number(n).toLocaleString('fr-FR').replace(/ /g, '.') + ' FCFA';

const STATUTS = {
  en_attente: ['badge-amber', 'En attente'],
  approuvee: ['badge-green', 'Validée'],
  rejectee: ['badge-red', 'Rejetée']
};
const badgeStatut = (s) => {
  const [cls, lbl] = STATUTS[s] || ['badge-blue', s];
  return `<span class="badge ${cls}">${lbl}</span>`;
};

const photo = (p, overlay = '') => `<div class="ph"><img src="/img/${p || 'room1'}.png" alt="" loading="lazy">${overlay}</div>`;

function annonceCard(a, actions = '') {
  const overlay = `<span class="badge badge-green">${esc(a.type)}</span>` +
    (a.boostActif ? '<span class="badge badge-blue badge-boost">Boosté</span>' : '');
  return `<article class="card an-card">
    <a href="/annonce.html?id=${a.id}">${photo(a.photo, overlay)}</a>
    <div class="an-body">
      <a href="/annonce.html?id=${a.id}"><h3>${esc(a.titre)}</h3></a>
      <span class="an-loc">${icon('map', 14)} ${esc(a.quartier)}</span>
      <span class="an-price">${fmtFCFA(a.prix)} <small>/mois</small></span>
    </div>
    ${actions ? `<div class="an-actions">${actions}</div>` : ''}
  </article>`;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function fmtDateVisite(v) {
  const demain = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  let d;
  if (v.date === demain) d = 'Demain';
  else {
    d = new Date(v.date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    d = d.charAt(0).toUpperCase() + d.slice(1);
  }
  return `${d}, ${v.heure}`;
}

const fmtDate = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

function timeAgo(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 3600) return `il y a ${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86400)} j`;
}

async function renderNav(active = '') {
  const user = await me();
  const links = [`<a href="/" class="${active === 'home' ? 'active' : ''}">Accueil</a>`];
  if (user) {
    links.push(`<a href="${homeFor(user.role)}">${user.role === 'admin' ? 'Administration' : user.role === 'bailleur' ? 'Espace bailleur' : 'Mon espace'}</a>`);
    links.push(`<span class="nav-user"><span class="avatar">${esc(user.prenom[0])}${esc(user.nom[0])}</span>${esc(user.prenom)}</span>`);
    links.push(`<button class="link" onclick="logout()">${icon('logout', 16)} Déconnexion</button>`);
  } else {
    links.push(`<a href="/connexion.html" class="${active === 'login' ? 'active' : ''}">Connexion</a>`);
    links.push(`<a class="btn btn-primary" href="/inscription.html">Inscription gratuite</a>`);
  }
  document.getElementById('nav').innerHTML = `<header class="nav"><div class="container nav-in">
    <a class="logo" href="/">
      <span class="logo-mark">${icon('home', 20)}</span>
      <span class="logo-txt"><b>TANAL</b><span>Sa Logement</span></span>
    </a>
    <nav class="nav-links">${links.join('')}</nav>
  </div></header>`;
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

const qs = (k) => new URLSearchParams(location.search).get(k);

async function mountMessages(root, user) {
  const convs = await api('/api/conversations');
  if (!convs.length) { root.innerHTML = '<div class="empty">Aucune conversation pour le moment.</div>'; return; }
  root.innerHTML = `<div class="msg-wrap">
    <div class="msg-list" id="msg-list"></div>
    <div class="msg-thread" id="msg-thread"></div>
  </div>`;
  const list = root.querySelector('#msg-list');
  const thread = root.querySelector('#msg-thread');

  async function open(id) {
    list.querySelectorAll('.msg-item').forEach((b) => b.classList.toggle('on', b.dataset.id == id));
    const msgs = await api('/api/messages?avec=' + id);
    thread.innerHTML = `<div class="msg-body">${msgs.map((m) =>
      `<div class="bubble ${m.fromId === user.id ? 'me' : ''}">${esc(m.texte)}<small>${timeAgo(m.date)}</small></div>`).join('') || '<div class="empty">Dites bonjour !</div>'}</div>
      <form class="msg-send"><input placeholder="Écrire un message..." required><button class="btn btn-primary btn-sm" type="submit">Envoyer</button></form>`;
    thread.querySelector('.msg-body').scrollTop = 1e6;
    thread.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      const input = e.target.querySelector('input');
      if (!input.value.trim()) return;
      await api('/api/messages', { method: 'POST', body: { toId: id, texte: input.value.trim() } });
      open(id);
    };
  }

  list.innerHTML = convs.map((c) => `<button class="msg-item" data-id="${c.user.id}">
    <span class="avatar">${esc(c.user.prenom[0])}${esc(c.user.nom[0])}</span>
    <span style="min-width:0"><b>${esc(c.user.prenom)} ${esc(c.user.nom)} ${c.nonLu ? `<span class="badge badge-amber">${c.nonLu}</span>` : ''}</b>
    <span>${esc(c.dernier.texte)}</span></span>
  </button>`).join('');
  list.querySelectorAll('.msg-item').forEach((b) => b.onclick = () => open(b.dataset.id));
  open(convs[0].user.id);
}

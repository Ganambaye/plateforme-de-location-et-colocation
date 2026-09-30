(async function () {
  await renderNav('home');
  const meta = await api('/api/meta');
  const fill = (id, items, fmt) => {
    document.getElementById(id).insertAdjacentHTML('beforeend',
      items.map((v) => `<option value="${v}">${fmt ? fmt(v) : v}</option>`).join(''));
  };
  fill('f-type', meta.types);
  fill('f-quartier', meta.quartiers);
  fill('f-prix', meta.prixMax, (v) => '≤ ' + fmtFCFA(v));

  const grid = document.getElementById('grid');
  async function load(filters = {}, title = 'Annonces récentes') {
    const params = new URLSearchParams(filters);
    const list = await api('/api/annonces?' + params);
    document.getElementById('grid-title').textContent = title;
    grid.innerHTML = list.length
      ? list.map((a) => annonceCard(a)).join('')
      : '<div class="empty" style="grid-column:1/-1">Aucune annonce ne correspond à votre recherche.</div>';
  }

  document.getElementById('search-form').onsubmit = (e) => {
    e.preventDefault();
    const filters = {};
    const t = document.getElementById('f-type').value;
    const q = document.getElementById('f-quartier').value;
    const p = document.getElementById('f-prix').value;
    if (t) filters.type = t;
    if (q) filters.quartier = q;
    if (p) filters.prixMax = p;
    load(filters, 'Résultats de recherche');
    document.getElementById('resultats').scrollIntoView({ behavior: 'smooth' });
  };

  document.getElementById('voir-tout').onclick = (e) => {
    e.preventDefault();
    ['f-type', 'f-quartier', 'f-prix'].forEach((id) => (document.getElementById(id).value = ''));
    load({}, 'Toutes les annonces');
  };

  await load();
})();

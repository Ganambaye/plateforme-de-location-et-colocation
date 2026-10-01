/* PWA Tanal Sa Logement : invitation d'installation (Android/Chrome)
   + aide "Ajouter à l'écran d'accueil" (iOS) + service worker. */
(function () {
  const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
  const DOWNLOAD_ICON =
    '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 21h16"/></svg>';

  function banner(html) {
    const d = document.createElement('div');
    d.className = 'pwa-banner';
    d.innerHTML = html;
    document.body.appendChild(d);
    return d;
  }

  const dejaInstalle = () =>
    matchMedia('(display-mode: standalone)').matches || (navigator.standalone === true);

  // Android / Chrome : le navigateur propose l'installation via le menu (3 points)
  // et on affiche en plus une invitation directe quand c'est disponible.
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (dejaInstalle() || sessionStorage.getItem('pwa-banner')) return;
    const d = banner(
      `<span>${DOWNLOAD_ICON}<b>Téléchargez Tanal comme application</b></span>` +
      '<button id="pwa-install">Installer</button>' +
      '<button class="pwa-close" aria-label="Fermer">×</button>'
    );
    sessionStorage.setItem('pwa-banner', '1');
    d.querySelector('#pwa-install').onclick = () => {
      deferredPrompt.prompt();
      deferredPrompt = null;
      d.remove();
    };
    d.querySelector('.pwa-close').onclick = () => d.remove();
  });

  // iOS (Safari) : pas d'installation automatique, on explique la manipulation.
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isIOS && !dejaInstalle() && !sessionStorage.getItem('pwa-banner')) {
    const d = banner(
      `<span>${DOWNLOAD_ICON}<b>Installez Tanal :</b> touchez Partager puis « Sur l'écran d'accueil »</span>` +
      '<button class="pwa-close" aria-label="Fermer">×</button>'
    );
    sessionStorage.setItem('pwa-banner', '1');
    d.querySelector('.pwa-close').onclick = () => d.remove();
  }

  // Service worker : uniquement sur le site hébergé (jamais en local).
  if (!LOCAL && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }
})();

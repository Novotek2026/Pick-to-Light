(() => {
  const installButton = document.getElementById('installAppButton');
  const isElectron = Boolean(window.ptlHardware) || window.location.protocol === 'file:';
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  let installPrompt = null;

  if ('serviceWorker' in navigator && !isElectron && window.location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch((error) => {
        console.warn('Offline app support could not be enabled:', error);
      });
    }, { once: true });
  }

  if (!installButton || isElectron || isStandalone) return;
  installButton.hidden = false;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    installButton.title = 'Install NOVOTEK Pick to Light';
  });

  installButton.addEventListener('click', async () => {
    if (!installPrompt) {
      window.alert('To install, open your browser menu and choose “Install app” or “Add to Home Screen”.');
      return;
    }

    installButton.disabled = true;
    installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    installPrompt = null;
    installButton.disabled = false;
    if (choice.outcome === 'accepted') installButton.hidden = true;
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    installButton.hidden = true;
  });
})();

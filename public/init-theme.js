// Applies the persisted theme before the React bundle mounts so the user
// never sees a flash of the wrong colour scheme. Lives in a static file so
// it can be loaded under a strict Content-Security-Policy (no `unsafe-inline`).
// Reads the same localStorage key that the Zustand `persist` middleware writes.
(function () {
  try {
    var stored = JSON.parse(localStorage.getItem('palladin-theme') || '{}')
    if ((stored.state && stored.state.theme) !== 'light') {
      document.documentElement.classList.add('dark')
    }
  } catch (e) {
    // Ignore — fall back to default (dark) class wiring via React mount.
  }
})()

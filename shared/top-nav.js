(() => {
  const container = document.getElementById('top-nav');
  if (!container) return;
  container.insertAdjacentHTML('beforebegin',
    '<header class="site-header">' +
    '<a class="brand" href="/"><img src="/media/f3-logo.webp" alt="F3" class="brand-logo" />F3 The Union</a>' +
    '<nav class="public-nav" aria-label="PAX navigation">' +
    '<a href="/pax/">PAX Home</a>' +
    '<a href="/pax/fng/history.html">FNG</a>' +
    '<a href="/pax/miles/">Miles</a>' +
    '<a href="/pax/miles/data.html">Miles Data</a>' +
    '<details class="nav-dropdown">' +
    '<summary>Reports</summary>' +
    '<div class="nav-dropdown-menu">' +
    '<a href="/pax/reports/">All Reports</a>' +
    '<a href="/pax/q/">Q Report</a>' +
    '<a href="/pax/never-q/">Need VQ</a>' +
    '</div>' +
    '</details>' +
    '<a href="/pax/reminders/">Reminders</a>' +
    '</nav>' +
    '</header>'
  );
  container.remove();

  // Close the Reports dropdown when clicking outside it or pressing Escape.
  const dropdown = document.querySelector('.nav-dropdown');
  if (dropdown) {
    document.addEventListener('click', (e) => {
      if (dropdown.open && !dropdown.contains(e.target)) {
        dropdown.open = false;
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') dropdown.open = false;
    });
  }
})();

(() => {
  const container = document.getElementById('public-nav');
  if (!container) return;
  container.insertAdjacentHTML('beforebegin',
    '<header class="site-header">' +
    '<a class="brand" href="/"><img src="/media/f3-theunion-logo.jpg" alt="F3 The Union" class="brand-logo" /></a>' +
    '<nav class="public-nav" aria-label="Main navigation">' +
    '<a href="/#workouts">Workouts</a>' +
    '<a href="/core-principles/">Core Principles</a>' +
    '<a href="/gallery/">Gallery</a>' +
    '<a href="/testimonials/">Testimonials</a>' +
    '<a href="/#contact">Contact</a>' +
    '</nav>' +
    '<div class="header-actions">' +
    '<div class="social-links" aria-label="Social links">' +
    '<a href="https://www.facebook.com/f3theunion/" target="_blank" rel="noopener">Facebook</a>' +
    '</div>' +
    '<a class="nav-login" href="/login/">PAX Login</a>' +
    '</div>' +
    '</header>'
  );
  container.remove();
})();

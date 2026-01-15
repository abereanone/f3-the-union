(() => {
  const container = document.getElementById('top-nav');
  if (!container) return;

  fetch('/shared/top-nav.html')
    .then((res) => res.text())
    .then((html) => {
      container.innerHTML = html;
    })
    .catch(() => {
      container.innerHTML =
        '<nav class="top-nav">' +
        '<a href="/index.html">Pre/BackBlast</a>' +
        '<a href="/kog/">KoG</a>' +
        '<a href="/kog/scoring.html">KoG Scoring</a>' +
        '<a href="/miles/">Miles</a>' +
        '</nav>';
    });
})();

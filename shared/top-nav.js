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
        '<a href="/miles/">Miles</a>' +
        '<a href="/miles/data.html">Miles Data</a>' +
        '<a href="/q/">Q Report</a>' +
        '</nav>';
    });
})();

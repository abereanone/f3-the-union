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
          '<a href="/pax/">PAX Home</a>' +
          '<a href="/pax/fng/">FNG</a>' +
          '<a href="/pax/miles/">Miles</a>' +
          '<a href="/pax/miles/data.html">Miles Data</a>' +
          '<a href="/pax/q/">Q Report</a>' +
          '<a href="/pax/kog/">KOG</a>' +
          '<a href="/pax/reminders/">Reminders</a>' +
          '<a href="/pax/never-q/">Need VQ</a>' +
          '</nav>';
    });
})();

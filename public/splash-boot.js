(function () {
  try {
    var mode = null;
    var language = null;
    try { mode = localStorage.getItem("htnote.themeMode"); } catch { /* Depolama isteğe bağlıdır. */ }
    try { language = localStorage.getItem("htnote.language"); } catch { /* Depolama isteğe bağlıdır. */ }
    var dark = mode === "dark" || (mode !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    language = language === "tr" || language === "en" ? language : (navigator.language.toLowerCase().startsWith("tr") ? "tr" : "en");
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.lang = language;
    document.querySelectorAll("#htnote-splash [data-i18n-tr]").forEach(function (element) {
      var text = element.getAttribute("data-i18n-" + language);
      if (element.hasAttribute("aria-label")) element.setAttribute("aria-label", text);
      else element.textContent = text;
    });
  } catch { /* Statik açık tema ve Türkçe metinler yedektir. */ }
})();

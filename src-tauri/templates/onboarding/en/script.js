(() => {
  const key = `${window.htnote?.noteId ?? "htnote-example"}:count`;
  const output = document.getElementById("count");
  let count = Number(localStorage.getItem(key)) || 0;
  const render = () => { output.value = String(count); };
  document.getElementById("decrease").addEventListener("click", () => { count--; localStorage.setItem(key, String(count)); render(); });
  document.getElementById("increase").addEventListener("click", () => { count++; localStorage.setItem(key, String(count)); render(); });
  render();
})();

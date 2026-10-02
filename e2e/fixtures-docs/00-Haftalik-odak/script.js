const noteId = window.htnote?.noteId ?? "showcase";
const key = `focus-count:${noteId}`;
const count = document.querySelector("#count");
const button = document.querySelector("#add-focus");
count.textContent = localStorage.getItem(key) ?? "0";
button.addEventListener("click", () => {
  const next = Number(count.textContent) + 1;
  count.textContent = String(next);
  localStorage.setItem(key, String(next));
});

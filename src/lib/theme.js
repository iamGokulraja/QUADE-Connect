// Dark / light theme. "light" is a class on <html> (see App.css); the choice is also kept in localStorage so the
// page never flashes the wrong colours, and in the person's profile so it follows them to other devices.
const KEY = "qc-theme";

export function applyTheme(theme) {
  const light = theme === "light";
  document.documentElement.classList.toggle("light", light);
  try { localStorage.setItem(KEY, light ? "light" : "dark"); } catch { /* storage blocked: still works for this visit */ }
}

export function initTheme() {
  try { applyTheme(localStorage.getItem(KEY) === "light" ? "light" : "dark"); } catch { /* ignore */ }
}

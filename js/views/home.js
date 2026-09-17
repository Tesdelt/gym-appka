import { renderDiagnostics } from '../diagnostics.js';

export const title = 'Domů';

export function render(container) {
  const wrap = document.createElement('div');
  wrap.className = 'stack';
  wrap.innerHTML = `
    <button type="button" class="btn btn-primary btn-hero" disabled>Nový trénink</button>
    <p class="muted small">Tréninky přibudou v dalším kroku stavby. Teď ověřujeme instalaci na plochu a běh offline.</p>`;
  container.append(wrap);
  renderDiagnostics(wrap);
}

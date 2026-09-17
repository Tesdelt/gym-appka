export const title = 'Statistiky';

export function render(container) {
  const card = document.createElement('section');
  card.className = 'card';
  card.innerHTML = `
    <h2 class="card-title">Zatím prázdné</h2>
    <p class="muted small">Tělesné míry, osobní rekordy a grafy. Přibude v dalších krocích stavby.</p>`;
  container.append(card);
}

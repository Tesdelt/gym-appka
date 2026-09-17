export const title = 'Cíle';

export function render(container) {
  const card = document.createElement('section');
  card.className = 'card';
  card.innerHTML = `
    <h2 class="card-title">Zatím prázdné</h2>
    <p class="muted small">Cíle u cviků a tělesných měr. Přibude v dalších krocích stavby.</p>`;
  container.append(card);
}

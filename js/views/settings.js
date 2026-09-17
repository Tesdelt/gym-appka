export const title = 'Nastavení';

export function render(container) {
  const card = document.createElement('section');
  card.className = 'card';
  card.innerHTML = `
    <h2 class="card-title">Zatím prázdné</h2>
    <p class="muted small">Typy tréninků, posilovny, vzhled, export a import dat. Přibude v dalších krocích stavby.</p>`;
  container.append(card);
}

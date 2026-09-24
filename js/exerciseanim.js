// Ukázka pohybu u cviku: obě fáze z databáze se střídají v malé smyčce
// (jako krátké video) a obrázek je přebarvený do barev appky (duotón).
// Když cvik fotky nemá, ukáže se svalová mapa.

import { exerciseImageUrls } from './images.js';
import { muscleMap } from './musclemap.js';
import { reducedMotion } from './fx.js';

const PHASE_MS = 900;

// box s fotkami cviku. play: false = jen první fáze (seznamy, mřížky)
export function exerciseAnim(exercise, { cls = 'ex-pic', play = true } = {}) {
  const box = document.createElement('div');
  box.className = `${cls} duo`;
  box.append(muscleMap(exercise?.muscles));
  box.classList.add('is-map');

  exerciseImageUrls(exercise).then((urls) => {
    if (!urls.length || !box.isConnected) return;
    const frames = urls.slice(0, 2).map((src, i) => {
      const img = document.createElement('img');
      img.alt = '';
      img.decoding = 'async';
      img.loading = 'lazy';
      img.src = src;
      img.className = `duo-frame ${i === 0 ? 'is-on' : ''}`;
      return img;
    });
    box.replaceChildren(...frames);
    box.classList.remove('is-map');
    if (!play || frames.length < 2 || reducedMotion()) return;

    let i = 0;
    let timer = null;
    const step = () => {
      i = (i + 1) % frames.length;
      frames.forEach((f, k) => f.classList.toggle('is-on', k === i));
    };
    const start = () => { timer ??= setInterval(step, PHASE_MS); };
    const stop = () => { clearInterval(timer); timer = null; };
    // běží, jen když je vidět
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) start();
      else stop();
    }, { threshold: 0.2 });
    io.observe(box);
    // úklid, až box zmizí ze stránky
    const watch = setInterval(() => {
      if (box.isConnected) return;
      stop();
      io.disconnect();
      clearInterval(watch);
    }, 4000);
  });
  return box;
}

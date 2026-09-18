// Obrázky cviků.
//
// exercise.images: pole odkazů. Odkaz je buď relativní cesta k souboru
// v repozitáři („img/exercises/shyb-0.jpg“), nebo „idb:<id>“ = obrázek
// uložený v IndexedDB (stažený z databáze při přidání cviku).
// exercise.photoId: vlastní fotka z mobilu (IndexedDB), má přednost.

import { get, put, remove, newId } from './db.js';

const FEDB_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

const urlCache = new Map();

async function blobUrl(id) {
  if (urlCache.has(id)) return urlCache.get(id);
  const row = await get('images', id);
  if (!row?.blob) return null;
  const url = URL.createObjectURL(row.blob);
  urlCache.set(id, url);
  return url;
}

export async function resolveRef(ref) {
  if (!ref) return null;
  if (ref.startsWith('idb:')) return blobUrl(ref.slice(4));
  return ref;
}

// Seznam URL obrázků cviku (vlastní fotka jako první a jediná)
export async function exerciseImageUrls(exercise) {
  if (!exercise) return [];
  if (exercise.photoId) {
    const url = await blobUrl(exercise.photoId);
    if (url) return [url];
  }
  const urls = await Promise.all((exercise.images ?? []).map(resolveRef));
  return urls.filter(Boolean);
}

// <div class="ex-pic"> s obrázkem, nebo zástupným symbolem. Klepnutí přepíná
// mezi fázemi pohybu (u obrázků z databáze jsou dvě).
export function imageBox(exercise, { cls = 'ex-pic', toggle = false } = {}) {
  const box = document.createElement('div');
  box.className = `${cls} is-empty`;
  box.innerHTML = PLACEHOLDER_SVG;
  exerciseImageUrls(exercise).then((urls) => {
    if (!urls.length) return;
    let i = 0;
    const img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    img.src = urls[0];
    box.replaceChildren(img);
    box.classList.remove('is-empty');
    if (toggle && urls.length > 1) {
      box.classList.add('is-toggle');
      box.addEventListener('click', () => { i = (i + 1) % urls.length; img.src = urls[i]; });
    }
  });
  return box;
}

// Zmenšení fotky na max. `max` px na delší straně, výstup JPEG
export async function resizeImage(blob, max = 1200, quality = 0.85) {
  let source;
  try {
    source = await createImageBitmap(blob);
  } catch {
    source = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Obrázek se nepodařilo načíst'));
      img.src = URL.createObjectURL(blob);
    });
  }
  const w = source.width;
  const h = source.height;
  const scale = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close?.();
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Převod obrázku selhal'))), 'image/jpeg', quality);
  });
}

export async function storeImage(blob) {
  const id = newId();
  await put('images', { id, blob, type: blob.type, createdAt: new Date().toISOString() });
  return id;
}

export async function deleteImage(id) {
  if (!id) return;
  const url = urlCache.get(id);
  if (url) { URL.revokeObjectURL(url); urlCache.delete(id); }
  await remove('images', id);
}

// Výběr fotky z mobilu (galerie nebo fotoaparát), zmenšení a uložení.
// Vrátí id uloženého obrázku, nebo null.
export function pickPhoto() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      try {
        resolve(await storeImage(await resizeImage(file, 1200)));
      } catch (err) {
        console.error(err);
        resolve(null);
      }
    });
    input.click();
  });
}

// ---------- Databáze free-exercise-db ----------
let indexPromise = null;
export function loadDbIndex() {
  if (!indexPromise) {
    indexPromise = fetch('data/free-exercise-db.json').then((r) => {
      if (!r.ok) throw new Error('Databázi cviků se nepodařilo načíst');
      return r.json();
    }).catch((err) => { indexPromise = null; throw err; });
  }
  return indexPromise;
}

// Podrobnosti cviku z databáze (postup) – vyžaduje internet
export async function fetchDbExercise(dbId) {
  const r = await fetch(`${FEDB_BASE}${encodeURIComponent(dbId)}.json`);
  if (!r.ok) throw new Error('Cvik se nepodařilo stáhnout');
  return r.json();
}

// Stáhne obrázky cviku z databáze, zmenší a uloží. Vrátí odkazy „idb:…“.
export async function downloadDbImages(dbId, count) {
  const refs = [];
  for (let i = 0; i < count; i++) {
    const r = await fetch(`${FEDB_BASE}${encodeURIComponent(dbId)}/${i}.jpg`);
    if (!r.ok) continue;
    const blob = await resizeImage(await r.blob(), 720, 0.7);
    refs.push(`idb:${await storeImage(blob)}`);
  }
  return refs;
}

export const MUSCLE_CS = {
  abdominals: 'břicho',
  abductors: 'abduktory',
  adductors: 'adduktory',
  biceps: 'biceps',
  calves: 'lýtka',
  chest: 'prsa',
  forearms: 'předloktí',
  glutes: 'hýždě',
  hamstrings: 'zadní stehna',
  lats: 'široký sval zádový',
  'lower back': 'spodní záda',
  'middle back': 'střední část zad',
  neck: 'krk',
  quadriceps: 'přední stehna',
  shoulders: 'ramena',
  traps: 'trapézy',
  triceps: 'triceps',
};

export const EQUIPMENT_FROM_DB = {
  cable: 'cable',
  dumbbell: 'dumbbell',
  barbell: 'barbell',
  'e-z curl bar': 'barbell',
  'body only': 'body',
  machine: 'machine',
  kettlebells: 'other',
  bands: 'other',
  'medicine ball': 'other',
  'exercise ball': 'other',
  'foam roll': 'other',
  other: 'other',
};

export const PLACEHOLDER_SVG = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" aria-hidden="true">
  <path d="M10 32h44M14 22v20M20 18v28M44 18v28M50 22v20"/></svg>`;

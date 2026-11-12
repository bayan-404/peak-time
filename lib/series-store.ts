// Client-side series storage (localStorage). Kept behind this tiny API so it
// can move to a server store later without touching the pages.
import type { Series } from "./series";

const KEY = "streakline:series:v1";

export function loadAll(): Series[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Series[];
  } catch {
    return [];
  }
}

function saveAll(list: Series[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Private mode / storage full: the page still works for this visit.
  }
}

export const getSeries = (id: string) => loadAll().find((s) => s.id === id) ?? null;

export function saveSeries(s: Series) {
  const list = loadAll().filter((x) => x.id !== s.id);
  saveAll([s, ...list]);
}

export function deleteSeries(id: string) {
  saveAll(loadAll().filter((s) => s.id !== id));
}

import { HistoryEntry } from '@/types/contact.types';

const HISTORY_KEY = 'aicc-tracer-history';
const MAX_HISTORY = 50;

export const historyService = {
  getAll(): HistoryEntry[] {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as HistoryEntry[];
    } catch {
      return [];
    }
  },

  save(entry: HistoryEntry): void {
    const history = this.getAll();
    // Remove existing entry for the same contactId (to move it to top)
    const filtered = history.filter(h => h.contactId !== entry.contactId);
    // Add new entry at the beginning
    const updated = [entry, ...filtered].slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  },

  remove(contactId: string): void {
    const history = this.getAll();
    const updated = history.filter(h => h.contactId !== contactId);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  },

  clear(): void {
    localStorage.removeItem(HISTORY_KEY);
  },
};

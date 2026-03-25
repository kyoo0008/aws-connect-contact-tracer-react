import { HistoryEntry } from '@/types/contact.types';

const HISTORY_KEY_PREFIX = 'aicc-tracer-history';
const MAX_HISTORY = 50;

function getKey(env: string): string {
  return `${HISTORY_KEY_PREFIX}-${env}`;
}

export const historyService = {
  getAll(env: string): HistoryEntry[] {
    try {
      const raw = localStorage.getItem(getKey(env));
      if (!raw) return [];
      return JSON.parse(raw) as HistoryEntry[];
    } catch {
      return [];
    }
  },

  save(env: string, entry: HistoryEntry): void {
    const history = this.getAll(env);
    const filtered = history.filter(h => h.contactId !== entry.contactId);
    const updated = [entry, ...filtered].slice(0, MAX_HISTORY);
    localStorage.setItem(getKey(env), JSON.stringify(updated));
  },

  remove(env: string, contactId: string): void {
    const history = this.getAll(env);
    const updated = history.filter(h => h.contactId !== contactId);
    localStorage.setItem(getKey(env), JSON.stringify(updated));
  },

  clear(env: string): void {
    localStorage.removeItem(getKey(env));
  },
};

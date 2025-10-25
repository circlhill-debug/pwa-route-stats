import { DateTime } from 'luxon';

class MemoryStorage {
  constructor() {
    this.store = new Map();
  }

  clear() {
    this.store.clear();
  }

  getItem(key) {
    const value = this.store.get(String(key));
    return value === undefined ? null : value;
  }

  setItem(key, value) {
    this.store.set(String(key), String(value));
  }

  removeItem(key) {
    this.store.delete(String(key));
  }

  key(index) {
    return Array.from(this.store.keys())[index] ?? null;
  }

  get length() {
    return this.store.size;
  }
}

globalThis.luxon = { DateTime };
globalThis.localStorage = new MemoryStorage();

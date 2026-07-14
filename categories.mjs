import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const CATEGORIES_FILE = join(dirname(fileURLToPath(import.meta.url)), 'categories.json');

export function loadCategories() {
  if (!existsSync(CATEGORIES_FILE)) return [];
  try {
    const raw = readFileSync(CATEGORIES_FILE, 'utf8');
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    console.error('⚠️  無法讀取 categories.json：', e.message);
    return [];
  }
}

export function saveCategories(list) {
  try {
    writeFileSync(CATEGORIES_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {
    console.error('⚠️  無法寫入 categories.json：', e.message);
  }
}

export function addCategory(name) {
  const trimmed = name.trim();
  if (!trimmed) return loadCategories();
  const list = loadCategories();
  if (!list.includes(trimmed)) {
    list.push(trimmed);
    saveCategories(list);
  }
  return list;
}

export function removeCategory(name) {
  const trimmed = name.trim();
  const list = loadCategories().filter((c) => c !== trimmed);
  saveCategories(list);
  return list;
}

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const CATEGORIES_FILE = join(dirname(fileURLToPath(import.meta.url)), 'categories.json');

let cache = null;

export function loadCategories() {
  if (cache) return cache;
  if (!existsSync(CATEGORIES_FILE)) return [];
  try {
    const raw = readFileSync(CATEGORIES_FILE, 'utf8');
    const list = JSON.parse(raw);
    cache = Array.isArray(list) ? list : [];
    return cache;
  } catch (e) {
    console.error('⚠️  無法讀取 categories.json：', e.message);
    return [];
  }
}

export function saveCategories(list) {
  try {
    writeFileSync(CATEGORIES_FILE, JSON.stringify(list, null, 2), 'utf8');
    cache = list;
  } catch (e) {
    console.error('⚠️  無法寫入 categories.json：', e.message);
  }
}

export function addCategory(name) {
  const trimmed = name.trim();
  const list = loadCategories();
  if (!trimmed || list.includes(trimmed)) return list;
  if (/[/\\]|\.\./.test(trimmed)) throw new Error(`分類名稱不可包含路徑字元：${trimmed}`);
  list.push(trimmed);
  saveCategories(list);
  return list;
}

export function removeCategory(name) {
  const trimmed = name.trim();
  const list = loadCategories();
  const filtered = list.filter((c) => c !== trimmed);
  if (filtered.length !== list.length) saveCategories(filtered);
  return filtered;
}

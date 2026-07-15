import { pipeline } from '@huggingface/transformers';

const MODEL = 'Xenova/clip-vit-base-patch32';

let classifierPromise = null;

function getClassifier() {
  if (!classifierPromise) {
    console.log('🧠 首次載入圖片分類模型（CLIP），下載/初始化可能需要一些時間...');
    classifierPromise = pipeline('zero-shot-image-classification', MODEL);
  }
  return classifierPromise;
}

/**
 * 依 CLIP zero-shot 分類，從 categories 裡選出與圖片最相似的分類名稱。
 * categories 為空陣列時回傳 null（呼叫端應視為「無分類」）。
 */
export async function classifyImage(buffer, categories) {
  if (!categories || categories.length === 0) return null;

  const classifier = await getClassifier();
  const blob = new Blob([buffer], { type: 'image/jpeg' });
  const results = await classifier(blob, categories);

  if (!results || results.length === 0) return null;
  return results.reduce((best, r) => (r.score > best.score ? r : best)).label;
}

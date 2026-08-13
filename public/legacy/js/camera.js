/**
 * camera.js - Photo capture and upload handler.
 */

let currentPhoto = null; // { base64, mimeType }

/**
 * Sets up event listeners for camera / upload UI.
 */
export function initCamera() {
  const captureBtn   = document.getElementById('capture-btn');
  const uploadBtn    = document.getElementById('upload-btn');
  const clearBtn     = document.getElementById('clear-photo-btn');
  const fileInput    = document.getElementById('file-input');

  // Capture button → triggers native camera via the file input that has capture="environment"
  captureBtn?.addEventListener('click', () => {
    fileInput?.click();
  });

  // Upload button → create a temporary input WITHOUT capture attribute for gallery selection
  uploadBtn?.addEventListener('click', () => {
    const tmpInput = document.createElement('input');
    tmpInput.type = 'file';
    tmpInput.accept = 'image/*';
    tmpInput.style.display = 'none';
    document.body.appendChild(tmpInput);

    tmpInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      document.body.removeChild(tmpInput);
    });

    tmpInput.click();
  });

  // Main file input change (from capture)
  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  });

  // Clear button
  clearBtn?.addEventListener('click', () => {
    clearPhoto();
  });
}

/**
 * Returns the current photo data or null.
 */
export function getCurrentPhoto() {
  return currentPhoto;
}

/**
 * Clears the current photo and resets UI.
 */
export function clearPhoto() {
  currentPhoto = null;

  const preview              = document.getElementById('photo-preview');
  const previewContainer     = document.getElementById('photo-preview-container');
  const placeholder          = document.getElementById('capture-placeholder');
  const analyzeBtn           = document.getElementById('analyze-btn');
  const fileInput            = document.getElementById('file-input');

  if (preview) preview.src = '';
  if (previewContainer) previewContainer.classList.add('hidden');
  if (placeholder) placeholder.classList.remove('hidden');
  if (analyzeBtn) analyzeBtn.classList.add('hidden');
  if (fileInput) fileInput.value = '';
}

// ── Internal ────────────────────────────────────────────

/**
 * Reads and compresses the file, then shows a preview.
 */
async function processFile(file) {
  try {
    const { base64, mimeType } = await compressImage(file);
    currentPhoto = { base64, mimeType };

    const preview              = document.getElementById('photo-preview');
    const previewContainer     = document.getElementById('photo-preview-container');
    const placeholder          = document.getElementById('capture-placeholder');
    const analyzeBtn           = document.getElementById('analyze-btn');

    if (preview) {
      preview.src = `data:${mimeType};base64,${base64}`;
    }
    if (previewContainer) previewContainer.classList.remove('hidden');
    if (placeholder) placeholder.classList.add('hidden');
    if (analyzeBtn) analyzeBtn.classList.remove('hidden');
  } catch (err) {
    console.error('處理圖片時發生錯誤：', err);
  }
}

/**
 * Compresses an image file to a max width while maintaining aspect ratio.
 * @param {File}   file
 * @param {number} maxWidth
 * @param {number} quality
 * @returns {Promise<{base64: string, mimeType: string}>}
 */
function compressImage(file, maxWidth = 1280, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const mimeType = 'image/jpeg';
        const dataUrl = canvas.toDataURL(mimeType, quality);
        const base64 = dataUrl.split(',')[1];

        resolve({ base64, mimeType });
      };

      img.onerror = () => reject(new Error('無法載入圖片'));
      img.src = e.target.result;
    };

    reader.onerror = () => reject(new Error('無法讀取檔案'));
    reader.readAsDataURL(file);
  });
}

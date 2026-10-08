/**
 * Image Processing & Compression Utilities
 * Automatically resizes and compresses plant photos to max 1080px and JPEG quality 80%,
 * reducing further if needed to keep the image data strictly below 700 KB.
 * Never allows oversized Base64 data to reach Firestore.
 */

export const MAX_IMAGE_BYTES = 700 * 1024; // 700 KB maximum

export interface ImageCompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  maxBytes?: number;
}

/**
 * Resizes and compresses an image File or Blob into a lightweight base64 JPEG data URL.
 * Automatically keeps the output strictly below 700 KB.
 * Rejects with a clear descriptive error if compression fails.
 */
export async function compressImageFile(
  file: File | Blob,
  options: ImageCompressionOptions = {}
): Promise<string> {
  const maxWidth = options.maxWidth || 1080;
  const maxHeight = options.maxHeight || 1080;
  const initialQuality = options.quality ?? 0.8;
  const targetMaxBytes = options.maxBytes || MAX_IMAGE_BYTES;

  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('The selected file is not a valid image format.'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read the selected image file.'));
    reader.onload = (e) => {
      const dataUrl = e.target?.result;
      if (typeof dataUrl !== 'string') {
        reject(new Error('Could not read image data.'));
        return;
      }

      const img = new Image();
      img.onerror = () => reject(new Error('Image data could not be decoded.'));
      img.onload = () => {
        try {
          let { width, height } = img;

          // Scale dimensions down to max 1080px preserving aspect ratio
          if (width > maxWidth || height > maxHeight) {
            const scale = Math.min(maxWidth / width, maxHeight / height);
            width = Math.max(1, Math.round(width * scale));
            height = Math.max(1, Math.round(height * scale));
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Image compression failed: Canvas rendering context unavailable.'));
            return;
          }

          // Use white background in case of transparent images
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          let quality = initialQuality;
          let currentCanvas = canvas;
          let currentWidth = width;
          let currentHeight = height;
          let compressedDataUrl = currentCanvas.toDataURL('image/jpeg', quality);

          // Progressive reduction: step 1 - reduce quality down to 0.35 if needed
          while (compressedDataUrl.length > targetMaxBytes && quality > 0.35) {
            quality = Math.max(0.3, Number((quality - 0.08).toFixed(2)));
            compressedDataUrl = currentCanvas.toDataURL('image/jpeg', quality);
          }

          // Progressive reduction: step 2 - if still over 700 KB, downscale dimensions progressively
          while (compressedDataUrl.length > targetMaxBytes && (currentWidth > 300 || currentHeight > 300)) {
            currentWidth = Math.max(1, Math.round(currentWidth * 0.75));
            currentHeight = Math.max(1, Math.round(currentHeight * 0.75));

            const scaledCanvas = document.createElement('canvas');
            scaledCanvas.width = currentWidth;
            scaledCanvas.height = currentHeight;
            const scaledCtx = scaledCanvas.getContext('2d');
            if (!scaledCtx) break;

            scaledCtx.fillStyle = '#FFFFFF';
            scaledCtx.fillRect(0, 0, currentWidth, currentHeight);
            scaledCtx.drawImage(img, 0, 0, currentWidth, currentHeight);
            currentCanvas = scaledCanvas;

            // Start at 80% quality for new resolution, then reduce if needed
            quality = 0.8;
            compressedDataUrl = currentCanvas.toDataURL('image/jpeg', quality);

            while (compressedDataUrl.length > targetMaxBytes && quality > 0.25) {
              quality = Math.max(0.2, Number((quality - 0.1).toFixed(2)));
              compressedDataUrl = currentCanvas.toDataURL('image/jpeg', quality);
            }
          }

          if (compressedDataUrl.length > targetMaxBytes) {
            reject(
              new Error(
                `Image data exceeds 700 KB limit (${Math.round(compressedDataUrl.length / 1024)} KB) after compression. Please upload a smaller photo.`
              )
            );
            return;
          }

          resolve(compressedDataUrl);
        } catch (canvasErr: any) {
          reject(new Error(`Image compression failed: ${canvasErr?.message || 'Processing error'}. Please choose another photo.`));
        }
      };

      img.src = dataUrl;
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Checks if a base64 string or URL is safely within Firestore's document field budget.
 */
export function isImageWithinFirestoreLimit(dataUrl: string, maxSafeChars: number = MAX_IMAGE_BYTES): boolean {
  if (!dataUrl) return true;
  if (dataUrl.startsWith('http://') || dataUrl.startsWith('https://')) return true;
  return dataUrl.length <= maxSafeChars;
}

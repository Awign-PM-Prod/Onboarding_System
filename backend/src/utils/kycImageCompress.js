import sharp from 'sharp';

export const KYC_STORED_MAX_BYTES = 150 * 1024;
const KYC_MAX_DIMENSION = 1600;
const QUALITY_STEPS = [82, 72, 62, 52, 42, 32, 22];

/**
 * Compress a KYC document image to at most maxBytes (default 150 KB).
 * Output is WebP or JPEG for storage; EXIF orientation is applied.
 */
export async function compressKycImageBuffer(inputBuffer, maxBytes = KYC_STORED_MAX_BYTES) {
  if (!inputBuffer?.length) {
    throw new Error('Empty image file.');
  }

  let pipeline = sharp(inputBuffer, { failOn: 'none' }).rotate();
  const meta = await pipeline.metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;

  if (width > KYC_MAX_DIMENSION || height > KYC_MAX_DIMENSION) {
    pipeline = pipeline.resize({
      width: KYC_MAX_DIMENSION,
      height: KYC_MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  let smallest = null;

  const consider = (buffer, contentType, ext) => {
    if (!buffer?.length) return;
    const entry = { buffer, contentType, ext, storedBytes: buffer.length };
    if (!smallest || buffer.length < smallest.buffer.length) {
      smallest = entry;
    }
    if (buffer.length <= maxBytes) {
      return entry;
    }
    return null;
  };

  for (const quality of QUALITY_STEPS) {
    const webpBuf = await pipeline.clone().webp({ quality }).toBuffer();
    const hit = consider(webpBuf, 'image/webp', 'webp');
    if (hit) {
      return { ...hit, originalBytes: inputBuffer.length };
    }
  }

  for (const quality of QUALITY_STEPS) {
    const jpegBuf = await pipeline.clone().jpeg({ quality, mozjpeg: true }).toBuffer();
    const hit = consider(jpegBuf, 'image/jpeg', 'jpg');
    if (hit) {
      return { ...hit, originalBytes: inputBuffer.length };
    }
  }

  if (smallest && smallest.storedBytes <= maxBytes) {
    return { ...smallest, originalBytes: inputBuffer.length };
  }

  const limitKb = Math.round(maxBytes / 1024);
  throw new Error(
    `Could not optimize this image below ${limitKb} KB. Please upload a clearer photo with less background.`
  );
}

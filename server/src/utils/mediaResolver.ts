export type ImageAspectRatio = '16:9' | '9:16' | '1:1' | 'auto';

/**
 * Derives the optimal product image aspect ratio from poster configuration.
 */
export function deriveTargetAspectRatio(posterConfig?: {
  template?: string;
  layoutMode?: string;
  imageAspectRatio?: string;
  columns?: number;
}, defaultOrientation: 'landscape' | 'portrait' = 'landscape'): '16:9' | '9:16' | '1:1' {
  if (!posterConfig) {
    return defaultOrientation === 'portrait' ? '9:16' : '16:9';
  }

  const explicit = posterConfig.imageAspectRatio;
  if (explicit && ['16:9', '9:16', '1:1'].includes(explicit)) {
    return explicit as '16:9' | '9:16' | '1:1';
  }

  const template = posterConfig.template;
  const layout = posterConfig.layoutMode;

  // 1. Vertical columns flow: daily specials with multiple columns
  if (template === 'daily_specials' || layout === 'row_cards' || (posterConfig.columns && posterConfig.columns >= 4)) {
    return '9:16';
  }

  // 2. Fullscreen spotlight hero stage: 16:9 landscape
  if (template === 'spotlight' || layout === 'spotlight') {
    return '16:9';
  }

  // 3. Grid matrix: 1:1 square
  if (template === 'featured_grid' || layout === 'grid') {
    return '1:1';
  }

  // 4. Duo / BOGO: wide horizontal stage
  if (template === 'bogo_duo') {
    return '16:9';
  }

  return defaultOrientation === 'portrait' ? '9:16' : '16:9';
}

/**
 * Universal multi-aspect-ratio product image resolution.
 * Automatically finds the highest quality matching asset according to the target ratio.
 */
export function resolveProductImageByRatio(
  p: any,
  targetRatio: '16:9' | '9:16' | '1:1' = '16:9',
  mediaAssets?: any[]
): string | null {
  if (!p) return null;

  // 1. Check ProductImage relations with attached MediaAsset
  if (p.images && p.images.length > 0) {
    if (targetRatio === '16:9') {
      const match16x9 = p.images.find(
        (img: any) =>
          img.media &&
          (/_16x9|16:9|16x9|landscape|horizontal/i.test(img.media.name) ||
            /_16x9|16:9|16x9/i.test(img.media.url))
      );
      if (match16x9) return match16x9.media.url;
    } else if (targetRatio === '9:16') {
      const match9x16 = p.images.find(
        (img: any) =>
          img.media &&
          (/_9x16|9:16|9x16|portrait|vertical/i.test(img.media.name) ||
            /_9x16|9:16|9x16/i.test(img.media.url))
      );
      if (match9x16) return match9x16.media.url;
    } else if (targetRatio === '1:1') {
      const match1x1 = p.images.find(
        (img: any) =>
          img.media &&
          (/_1x1|1:1|square/i.test(img.media.name) || /_1x1|1:1/i.test(img.media.url))
      );
      if (match1x1) return match1x1.media.url;
    }
  }

  // 2. Check store MediaAsset library matching product name and orientation tag
  if (mediaAssets && mediaAssets.length > 0) {
    const cleanName = (p.name || '').trim().toLowerCase().replace(/[\s\-_]+/g, '');
    const suffix = targetRatio === '16:9' ? '16x9' : targetRatio === '9:16' ? '9x16' : '1x1';
    
    // Strict match: product name AND ratio tag
    const matched = mediaAssets.find((m: any) => {
      const mName = (m.name || '').trim().toLowerCase().replace(/[\s\-_]+/g, '');
      const hasRatio = mName.includes(suffix) || (targetRatio === '16:9' && /landscape|horizontal/i.test(mName)) || (targetRatio === '9:16' && /portrait|vertical/i.test(mName));
      return hasRatio && (mName.includes(cleanName) || cleanName.includes(mName.replace(suffix, '').replace(/landscape|horizontal|portrait|vertical/g, '')));
    });
    if (matched) return matched.url;
  }

  // 3. Fallbacks: primary image -> first attached image -> any image
  if (p.image) return p.image;
  if (p.images && p.images[0]?.media?.url) return p.images[0].media.url;
  return null;
}

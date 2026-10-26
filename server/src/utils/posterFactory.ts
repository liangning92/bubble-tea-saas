import { deriveTargetAspectRatio } from './mediaResolver';

export interface PosterDerivationInput {
  activityType: string;
  rule: {
    price?: number;
    percent?: number;
    amount?: number;
    buy?: number;
    get?: number;
    minAmount?: number;
  };
  products?: Array<{ id: string; name: string }>;
  weekdays?: number[];
  categoryName?: string;
  preferredTemplate?: 'daily_specials' | 'spotlight' | 'featured_grid' | 'bogo_duo';
  preferredRatio?: '9:16' | '16:9' | '1:1' | 'auto';
  customHeadline?: string;
  customSubheadline?: string;
  themeColor?: string;
  backgroundColor?: string;
}

export interface DerivedPosterConfig {
  template: 'daily_specials' | 'spotlight' | 'featured_grid' | 'bogo_duo';
  imageAspectRatio: '9:16' | '16:9' | '1:1';
  headline: string;
  subheadline: string;
  columns: number;
  rows: number;
  layoutMode: 'row_cards' | 'grid' | 'spotlight';
  highlightToday: boolean;
  themeColor: string;
  backgroundColor: string;
  showFields: {
    productImage: boolean;
    productName: boolean;
    productSubname: boolean;
    originalPrice: boolean;
    specialPrice: boolean;
    savingAmount: boolean;
    dayBadge: boolean;
    discountTag: boolean;
  };
}

/**
 * Clean commercial copy generator.
 * Strictly guarantees that internal developer notes, AI prefixes, or template keys are NEVER displayed to customers.
 */
export function sanitizeCommercialCopy(text?: string): string {
  if (!text) return '';
  return text
    .replace(/^由\s*AI\s*助手[^:]*:\s*/i, '')
    .replace(/^created by ai assistant[^:]*:\s*/i, '')
    .replace(/\s*\([^)]*daily_specials[^)]*\)\s*/gi, ' ')
    .replace(/\s*\([^)]*spotlight[^)]*\)\s*/gi, ' ')
    .replace(/\s*\([^)]*featured_grid[^)]*\)\s*/gi, ' ')
    .replace(/\s*\([^)]*指定\d+款商品\)\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Campaign Poster Factory.
 * Systematically constructs compliant, elegant poster configurations based on business parameters.
 */
export function createCampaignPosterConfig(input: PosterDerivationInput): DerivedPosterConfig {
  const prods = input.products || [];
  const prodCount = prods.length;
  const isBogo = input.activityType === 'buy_get' || (!!input.rule.buy && !!input.rule.get);
  const isMultiDay = !!input.weekdays && input.weekdays.length >= 3 && input.weekdays.length <= 7;

  // 1. Determine optimal template
  let template: 'daily_specials' | 'spotlight' | 'featured_grid' | 'bogo_duo' = 'daily_specials';
  if (input.preferredTemplate) {
    template = input.preferredTemplate;
  } else if (prodCount === 1) {
    template = 'spotlight';
  } else if (isBogo) {
    template = 'bogo_duo';
  } else if (isMultiDay && prodCount >= 3) {
    template = 'daily_specials';
  } else if (prodCount >= 4) {
    template = 'featured_grid';
  } else {
    template = 'daily_specials';
  }

  // 2. Determine optimal layout & columns
  let layoutMode: 'row_cards' | 'grid' | 'spotlight' = 'row_cards';
  let columns = Math.min(Math.max(prodCount, 1), 7);
  let rows = 1;

  if (template === 'spotlight') {
    layoutMode = 'spotlight';
    columns = 1;
    rows = 1;
  } else if (template === 'featured_grid') {
    layoutMode = 'grid';
    columns = prodCount <= 4 ? 2 : 3;
    rows = Math.ceil(prodCount / columns);
  } else if (template === 'bogo_duo') {
    layoutMode = 'row_cards';
    columns = 2;
    rows = 1;
  } else {
    layoutMode = 'row_cards';
    columns = Math.min(Math.max(prodCount, 5), 7);
    rows = 1;
  }

  // 3. Determine required aspect ratio
  const imageAspectRatio = deriveTargetAspectRatio({
    template,
    layoutMode,
    imageAspectRatio: input.preferredRatio,
    columns,
  });

  // 4. Derive customer-facing commercial Headline
  let headline = sanitizeCommercialCopy(input.customHeadline);
  if (!headline) {
    if (template === 'spotlight' && prods[0]) {
      headline = `Spesial: ${prods[0].name}`;
    } else if (template === 'bogo_duo') {
      headline = `Beli ${input.rule.buy || 1} Gratis ${input.rule.get || 1}`;
    } else if (template === 'featured_grid') {
      headline = input.categoryName ? `Menu Favorit ${input.categoryName}` : 'Pilihan Menu Terbaik';
    } else {
      headline = input.categoryName ? `Spesial ${input.categoryName} Mingguan` : 'Spesial Menu Mingguan';
    }
  }

  // 5. Derive customer-facing commercial Subheadline
  let subheadline = sanitizeCommercialCopy(input.customSubheadline);
  if (!subheadline) {
    let benefit = '';
    if (input.rule.amount && input.rule.amount > 0) {
      benefit = `Hemat Rp ${input.rule.amount.toLocaleString('id-ID')}`;
    } else if (input.rule.percent && input.rule.percent > 0) {
      benefit = `Diskon ${input.rule.percent}%`;
    } else if (input.rule.price) {
      benefit = `Mulai Rp ${input.rule.price.toLocaleString('id-ID')}`;
    } else {
      benefit = 'Harga Spesial Terbaik';
    }

    if (isMultiDay && input.weekdays?.length === 5 && !input.weekdays.includes(0) && !input.weekdays.includes(6)) {
      subheadline = `${benefit} Setiap Hari Senin - Jumat`;
    } else {
      subheadline = `${benefit} Waktu Terbatas di Seluruh Gerai`;
    }
  }

  return {
    template,
    imageAspectRatio,
    headline,
    subheadline,
    columns,
    rows,
    layoutMode,
    highlightToday: true,
    themeColor: input.themeColor || '#FF4B72',
    backgroundColor: input.backgroundColor || '#121214',
    showFields: {
      productImage: true,
      productName: true,
      productSubname: true,
      originalPrice: true,
      specialPrice: true,
      savingAmount: true,
      dayBadge: template === 'daily_specials',
      discountTag: template !== 'daily_specials',
    },
  };
}

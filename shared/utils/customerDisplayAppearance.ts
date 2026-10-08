import type { CustomerDisplayLogoStyle } from '../components/CustomerDisplayLogo'
import type { PromotionTextStyle } from '../components/PromotionText'
import { customerBackground } from '../components/CustomerDisplayLayout'
export type CustomerDisplayState = 'idle' | 'ordering' | 'complete'
export interface CustomerDisplayAppearance {
  mediaMode?: 'rotate' | 'single'
  mediaFit?: 'cover' | 'contain'
  fixedMediaUrl?: string
  promotions?: string[]
  welcomeText?: string
  welcomeStyle?: PromotionTextStyle
  logoStyle?: CustomerDisplayLogoStyle
  autoSyncPromotions?: boolean
  backgroundColor?: string
  regionBackgrounds?: Partial<Record<'media' | 'promotions' | 'welcome' | 'logo', string>>
  orderHeaderColor?: string
  orderBackgroundColor?: string
  promotionsStyle?: PromotionTextStyle
  promotionsSubtitleStyle?: PromotionTextStyle
}
export interface CustomerAppearanceConfig {
  mediaMode?: 'rotate' | 'single'
  mediaFit?: 'cover' | 'contain'
  fixedMediaUrl?: string
  promotions?: string[]
  welcomeText?: string
  welcomeStyle?: PromotionTextStyle
  logoStyle?: CustomerDisplayLogoStyle
  autoSyncPromotions?: boolean
  backgroundColor?: string
  promotionsStyle?: PromotionTextStyle
  promotionsSubtitleStyle?: PromotionTextStyle
  stateAppearance?: Partial<Record<CustomerDisplayState, CustomerDisplayAppearance>>
}
export function customerDisplayAppearance(config: CustomerAppearanceConfig, state: CustomerDisplayState): CustomerDisplayAppearance & { backgroundColor: string; orderHeaderColor: string; orderBackgroundColor: string } {
  const appearance = config.stateAppearance?.[state] || {}
  return {
    ...appearance,
    mediaMode: appearance.mediaMode ?? config.mediaMode ?? 'rotate',
    mediaFit: appearance.mediaFit ?? config.mediaFit ?? 'cover',
    fixedMediaUrl: appearance.fixedMediaUrl ?? config.fixedMediaUrl,
    promotions: appearance.promotions ?? config.promotions,
    welcomeText: appearance.welcomeText ?? config.welcomeText ?? '',
    welcomeStyle: { ...config.welcomeStyle, ...appearance.welcomeStyle },
    logoStyle: { ...config.logoStyle, ...appearance.logoStyle },
    autoSyncPromotions: appearance.autoSyncPromotions ?? config.autoSyncPromotions,
    backgroundColor: customerBackground(appearance.backgroundColor || (state === 'complete' ? '#16A34A' : config.backgroundColor)),
    orderHeaderColor: customerBackground(appearance.orderHeaderColor || '#D94D6E'),
    orderBackgroundColor: customerBackground(appearance.orderBackgroundColor || '#F9FAFB'),
    promotionsStyle: { ...config.promotionsStyle, ...appearance.promotionsStyle },
    promotionsSubtitleStyle: { ...config.promotionsSubtitleStyle, ...appearance.promotionsSubtitleStyle },
  }
}

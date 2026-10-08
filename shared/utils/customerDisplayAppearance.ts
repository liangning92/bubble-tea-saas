import type { PromotionTextStyle } from '../components/PromotionText'
import { customerBackground } from '../components/CustomerDisplayLayout'
export type CustomerDisplayState = 'idle' | 'ordering' | 'complete'
export interface CustomerDisplayAppearance {
  backgroundColor?: string
  regionBackgrounds?: Partial<Record<'media' | 'promotions' | 'welcome' | 'logo', string>>
  orderHeaderColor?: string
  orderBackgroundColor?: string
  promotionsStyle?: PromotionTextStyle
  promotionsSubtitleStyle?: PromotionTextStyle
}
export interface CustomerAppearanceConfig {
  backgroundColor?: string
  promotionsStyle?: PromotionTextStyle
  promotionsSubtitleStyle?: PromotionTextStyle
  stateAppearance?: Partial<Record<CustomerDisplayState, CustomerDisplayAppearance>>
}
export function customerDisplayAppearance(config: CustomerAppearanceConfig, state: CustomerDisplayState): CustomerDisplayAppearance & { backgroundColor: string; orderHeaderColor: string; orderBackgroundColor: string } {
  const appearance = config.stateAppearance?.[state] || {}
  return {
    ...appearance,
    backgroundColor: customerBackground(appearance.backgroundColor || (state === 'complete' ? '#16A34A' : config.backgroundColor)),
    orderHeaderColor: customerBackground(appearance.orderHeaderColor || '#D94D6E'),
    orderBackgroundColor: customerBackground(appearance.orderBackgroundColor || '#F9FAFB'),
    promotionsStyle: { ...config.promotionsStyle, ...appearance.promotionsStyle },
    promotionsSubtitleStyle: { ...config.promotionsSubtitleStyle, ...appearance.promotionsSubtitleStyle },
  }
}

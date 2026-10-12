// Test exports reference the same static namespaces as the runtime and lint scanner.
import i18n from './index'
const language = (lng:string) => {
  const bundle=i18n.getResourceBundle(lng,'translation')
  return {media:bundle.media,insights:bundle.insights}
}
export const mediaInsightsTranslations = {zh:language('zh'),en:language('en'),id:language('id')}

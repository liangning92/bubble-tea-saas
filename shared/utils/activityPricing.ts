export interface ActivityPriceRule {
  id: string; productId: string; price: number; daysOfWeek?: number[]
  channels?: string[]; startTime?: string; endTime?: string; status?: string
}
export function activityPrice(rules: ActivityPriceRule[], productId: string, basePrice: number, channel: string, now = new Date()) {
  const weekday = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Jakarta',weekday:'short'}).format(now))
  const eligible = rules.filter(rule => rule.productId === productId && (!rule.status || rule.status === 'active') && Number.isInteger(rule.price) && rule.price >= 0 && (!rule.startTime || now.getTime() >= new Date(rule.startTime).getTime()) && (!rule.endTime || now.getTime() < new Date(rule.endTime).getTime()) && (!rule.daysOfWeek?.length || rule.daysOfWeek.includes(weekday)) && (!rule.channels?.length || rule.channels.includes(channel)))
  return eligible.reduce((price, rule) => Math.min(price, rule.price), basePrice)
}

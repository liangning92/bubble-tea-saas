export interface NotificationDelivery { inApp: boolean; push: string; device: 'unknown'; read: boolean }
export function NotificationDeliveryStatus({ value, language }: { value?: NotificationDelivery; language: string }) {
  if (!value) return null
  const zh = language.startsWith('zh'), en = language.startsWith('en')
  const push = ({ service_accepted: ['推送服务已接受', 'Push service accepted', 'Layanan push menerima'], partial: ['部分推送服务接受', 'Some push services accepted', 'Sebagian layanan push menerima'], queued: ['推送排队中', 'Push queued', 'Push dalam antrean'], failed: ['推送失败', 'Push failed', 'Push gagal'] } as Record<string, string[]>)[value.push]
  const label = push?.[zh ? 0 : en ? 1 : 2] || (zh ? '暂无推送服务回执' : en ? 'No push service receipt confirmed' : 'Belum ada konfirmasi layanan push')
  return <p className="awareness-preview">{zh ? '已保存到系统' : en ? 'Saved in app' : 'Tersimpan di aplikasi'} · {label} · {zh ? '手机到达：未知' : en ? 'Phone receipt: unknown' : 'Diterima HP: belum diketahui'}</p>
}

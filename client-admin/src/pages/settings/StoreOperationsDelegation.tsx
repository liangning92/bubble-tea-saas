import { useEffect, useState } from 'react'
import type { TeamClient } from '../../../../shared/TeamCommunication'

export function StoreOperationsDelegation({
  client,
  language,
}: {
  client: Pick<TeamClient, 'request' | 'current'>
  language: string
}) {
  const zh = language.startsWith('zh'),
    id = language.startsWith('id')
  const l = (a: string, b: string, c: string) => (zh ? a : id ? b : c)
  const [state, setState] = useState<any>(null),
    [selected, setSelected] = useState<string[]>([]),
    [confirmed, setConfirmed] = useState(false),
    [credential, setCredential] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const load = async () => {
    try {
      const next = await client.request('get', '/api/team/ai/operations-delegations')
      if (
        !next ||
        !Array.isArray(next.activities) ||
        !Array.isArray(next.delegations) ||
        !next.policy ||
        typeof next.policy.enabled !== 'boolean'
      ) {
        throw new Error('OPERATIONS_STATE_INVALID')
      }
      setState(next)
      setError('')
    } catch (e: any) {
      setState(null)
      setError(
        l(
          '需先在智能体权限中启用营销与会员写入，且授权未到期。',
          'Aktifkan izin tulis pemasaran dan member untuk agent terlebih dahulu; izin harus masih berlaku.',
          'Enable current agent marketing and member write permissions first.',
        ),
      )
    }
  }
  useEffect(() => {
    void load()
  }, [client])
  const create = async () => {
    setBusy(true)
    setError('')
    try {
      const result: any = await client.request('post', '/api/team/ai/operations-delegations', {
        activityIds: selected,
        expiresAt: state.authorizationExpiresAt,
        confirm: 'daily_member_specials_and_single_paid_order_30000',
      })
      if (client.current()) {
        setCredential(result.credential)
        setConfirmed(false)
        await load()
      }
    } catch (e: any) {
      setError(
        l(
          '授权未保存，请检查现有权限和有效期。',
          'Izin belum tersimpan. Periksa izin agent dan masa berlakunya.',
          'Authorization was not saved. Check permissions and expiry.',
        ),
      )
    } finally {
      setBusy(false)
    }
  }
  const revoke = async (value: string) => {
    setBusy(true)
    try {
      await client.request('post', '/api/team/ai/operations-delegations/' + value + '/revoke', {})
      await load()
    } catch {
      setError(
        l(
          '撤销失败，请刷新重试。',
          'Gagal mencabut izin. Muat ulang lalu periksa.',
          'Could not revoke; refresh and check.',
        ),
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <section
      className="card space-y-4"
      aria-label={l(
        '运营Agent限定业务接口',
        'Akses terbatas Agent Operasional',
        'Scoped Operations Agent API',
      )}
    >
      <h3 className="font-semibold">
        {l(
          '运营 Agent · 每日会员特价接口',
          'Agent Operasional · Promo Harian Member',
          'Operations Agent · Daily Member Specials',
        )}
      </h3>
      <p className="text-sm text-gray-600">
        {l(
          '只授权将所选既有每日特价设为会员专享，以及单笔已完成实付满 Rp30,000 后入会。后续会员订单不重复要求满额；不改商品、特价、排期，不支付或发布新活动。',
          'Izin hanya untuk membuat promo harian terpilih khusus member, serta mengaktifkan member setelah satu transaksi selesai dibayar minimal Rp30.000. Pembelian member berikutnya tidak perlu mencapai batas itu lagi. Produk, harga, jadwal, dan pembayaran tidak diubah.',
          'Only makes selected daily specials member-only and activates membership after one completed paid order of Rp30,000. Later member orders have no repeated threshold. Cannot change products, prices, schedules, payments, or publish new campaigns.',
        )}
      </p>
      <button
        type="button"
        className="rounded border px-3 py-2 text-sm"
        onClick={() => void load()}
      >
        {l('刷新接口状态', 'Muat ulang status', 'Refresh status')}
      </button>
      {error && (
        <p role="alert" className="text-sm text-amber-700">
          {error}
        </p>
      )}
      {state && (
        <>
          {!state.canDelegate && (
            <p className="text-sm text-amber-700">
              {l(
                '请先在上方授权中启用有效的营销与会员写入权限。现有委托仍可在此撤销。',
                'Aktifkan izin tulis pemasaran dan member di atas. Izin lama tetap dapat dicabut di sini.',
                'Enable current marketing and member write permissions above. Existing delegations can still be revoked here.',
              )}
            </p>
          )}
          <p className="text-sm">
            {l('入会规则：', 'Aturan member: ', 'Membership rule: ')}
            {state.policy.enabled
              ? 'Rp30,000 · ' + l('满一次入会', 'cukup satu transaksi', 'one qualifying order')
              : l('尚未配置', 'belum diatur', 'not configured')}
          </p>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              {l(
                '选择允许调整的现有每日特价',
                'Pilih promo harian yang boleh diatur',
                'Choose existing daily specials',
              )}
            </legend>
            {state.activities.map((a: any) => (
              <label key={a.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(a.id)}
                  onChange={(e) =>
                    setSelected((v) =>
                      e.target.checked ? [...v, a.id] : v.filter((x) => x !== a.id),
                    )
                  }
                />
                <span>
                  {a.name} · v{a.version} ·{' '}
                  {a.memberOnly
                    ? l('会员专享', 'khusus member', 'members only')
                    : l('所有顾客', 'semua pelanggan', 'all customers')}
                </span>
              </label>
            ))}
            {!state.activities.length && (
              <p className="text-sm text-gray-500">
                {l(
                  '未找到可授权的每日特价；不会自动创建或改变价格。',
                  'Tidak ada promo harian yang sesuai. Harga atau promo baru tidak dibuat otomatis.',
                  'No eligible daily specials; no prices or new promotions will be created automatically.',
                )}
              </p>
            )}
          </fieldset>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>
              {l(
                '我确认授予上述运营接口权限，沿用已有业务授权有效期，可随时撤销。该授权不续期 PDCA 或全局智能体权限。',
                'Saya memberikan izin operasional di atas sampai izin bisnis yang sudah ada berakhir, dan dapat mencabutnya kapan saja. Ini tidak memperpanjang izin PDCA atau izin agent lainnya.',
                'I authorize this scoped operations API until the existing business authorization expires, revocable any time. Does not renew PDCA or other agent permissions.',
              )}
            </span>
          </label>
          <button
            type="button"
            disabled={busy || !confirmed || !selected.length || !state.canDelegate}
            onClick={() => void create()}
            className="rounded bg-primary px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {l('生成限定接口凭据', 'Buat kredensial terbatas', 'Create scoped credential')}
          </button>
          {credential && (
            <div className="space-y-2 rounded border p-3">
              <p className="text-sm font-medium">
                {l(
                  '仅本次显示：在工作台的运营接口连接处安全保存，不发送给员工或公开渠道。',
                  'Hanya ditampilkan sekali. Simpan di koneksi operasional workbench; jangan kirim ke staf atau kanal publik.',
                  'Shown once. Save in the workbench operations connection; do not send to staff or public channels.',
                )}
              </p>
              <textarea
                readOnly
                aria-label={l('运营接口凭据', 'Kredensial operasional', 'Operations credential')}
                value={credential}
                className="w-full break-all rounded border p-2 font-mono text-xs"
                rows={3}
              />
              <button
                type="button"
                className="rounded border px-3 py-2 text-sm"
                onClick={() => setCredential('')}
              >
                {l('隐藏凭据', 'Sembunyikan', 'Hide credential')}
              </button>
            </div>
          )}
          {state.delegations.map((d: any) => (
            <div
              className="flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm"
              key={d.id}
            >
              <span>
                {d.id.slice(0, 8)} ·{' '}
                {d.revoked
                  ? l('已撤销', 'dicabut', 'revoked')
                  : d.expiresAt
                    ? new Date(d.expiresAt).toLocaleString()
                    : l('持续授权，可撤销', 'berlaku sampai dicabut', 'until revoked')}{' '}
                · {d.activityIds.length} {l('项活动', 'promo', 'activities')}
              </span>
              <button
                type="button"
                disabled={busy || d.revoked}
                onClick={() => void revoke(d.id)}
                className="rounded border px-3 py-2 disabled:opacity-50"
              >
                {l('撤销', 'Cabut', 'Revoke')}
              </button>
            </div>
          ))}
        </>
      )}
    </section>
  )
}

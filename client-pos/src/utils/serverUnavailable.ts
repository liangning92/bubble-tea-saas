/** Only transport failures and temporary gateway/service outages permit cached reads. */
export function serverUnavailable(error: any): boolean {
  const status = error?.response?.status
  return !error?.response || [502, 503, 504].includes(status) || (status >= 520 && status <= 530)
}

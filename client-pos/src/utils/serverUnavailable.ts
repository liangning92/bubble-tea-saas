/** Only transport failures and temporary gateway/service outages permit cached reads. */
export function serverUnavailable(error: any): boolean {
  return !error?.response || [502, 503, 504].includes(error.response.status)
}

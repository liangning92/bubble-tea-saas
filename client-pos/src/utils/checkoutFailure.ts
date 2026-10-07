// Queue only an actual transport failure after Axios attempted the request.
// Business rejections and local programming errors must not become offline sales.
export function canQueueCheckoutFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const failure = error as { isAxiosError?: boolean; request?: unknown; response?: unknown }
  return failure.isAxiosError === true && Boolean(failure.request) && !failure.response
}

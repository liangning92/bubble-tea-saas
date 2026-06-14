/**
 * 触屏震动反馈
 * 在支持的设备上提供触觉反馈
 */
export function touchFeedback() {
  if ('vibrate' in navigator) {
    navigator.vibrate(10)
  }
}

/**
 * 成功反馈 - 稍长的震动
 */
export function touchSuccess() {
  if ('vibrate' in navigator) {
    navigator.vibrate([20, 30, 20])
  }
}

/**
 * 错误反馈 - 连续短震动
 */
export function touchError() {
  if ('vibrate' in navigator) {
    navigator.vibrate([10, 10, 10, 10, 10])
  }
}
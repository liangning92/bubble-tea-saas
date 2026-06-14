import React from 'react'

export function TestPage() {
  return (
    <div style={{ padding: 20, fontSize: 18 }}>
      <h1>🧋 POS Test</h1>
      <p>如果看到这个，说明基本环境正常</p>
      <button onClick={() => alert('按钮正常')}>测试按钮</button>
    </div>
  )
}

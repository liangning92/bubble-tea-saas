import dgram from 'dgram'
import os from 'os'
import { config } from '../config/env'

const DISCOVERY_PORT = 7078
let socket: dgram.Socket | null = null
let beaconTimer: NodeJS.Timeout | null = null

function getLocalIpAddresses(): string[] {
  const interfaces = os.networkInterfaces()
  const ips: string[] = []
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address)
      }
    }
  }
  return ips
}

export function startTvDiscoveryService(): void {
  try {
    socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })

    socket.on('error', (err) => {
      console.warn('[TV Discovery] Socket error:', err.message)
    })

    socket.on('message', (msg, rinfo) => {
      const msgStr = msg.toString().trim()
      if (msgStr.includes('DISCOVER') || msgStr.includes('PING') || msgStr.includes('TEA_POS')) {
        const payload = JSON.stringify({
          service: 'TEA_POS_TV',
          port: config.port,
          timestamp: Date.now()
        })
        const replyBuffer = Buffer.from(`TEA_POS_TV_ACK:${payload}`)
        socket?.send(replyBuffer, 0, replyBuffer.length, rinfo.port, rinfo.address, (err) => {
          if (!err) {
            console.log(`[TV Discovery] Responded to discovery from ${rinfo.address}:${rinfo.port}`)
          }
        })
      }
    })

    socket.bind(DISCOVERY_PORT, '0.0.0.0', () => {
      try {
        socket?.setBroadcast(true)
        console.log(`[TV Discovery] UDP auto-discovery service listening on port ${DISCOVERY_PORT}`)

        // 周期性局域网信标广播 (每 5 秒广播一次，方便新开机的电视在 1~3 秒内秒级自发现)
        beaconTimer = setInterval(() => {
          if (!socket) return
          const localIps = getLocalIpAddresses()
          const payload = JSON.stringify({
            service: 'TEA_POS_TV',
            port: config.port,
            ips: localIps,
            timestamp: Date.now()
          })
          const beaconMsg = Buffer.from(`TEA_POS_BEACON:${payload}`)
          socket.send(beaconMsg, 0, beaconMsg.length, DISCOVERY_PORT, '255.255.255.255', () => {})
        }, 5000)
      } catch (err: any) {
        console.warn('[TV Discovery] Failed to set broadcast:', err.message)
      }
    })
  } catch (err: any) {
    console.warn('[TV Discovery] Failed to start discovery service:', err.message)
  }
}

export function stopTvDiscoveryService(): void {
  if (beaconTimer) {
    clearInterval(beaconTimer)
    beaconTimer = null
  }
  if (socket) {
    try {
      socket.close()
    } catch {}
    socket = null
  }
}

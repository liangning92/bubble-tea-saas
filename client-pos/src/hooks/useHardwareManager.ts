import { useEffect, useRef } from 'react'
import { posApi } from '../services/api'
import { useAuthStore } from '../stores/auth'

/**
 * Hook that polls for hardware detection requests and responds
 * Runs in background while POS is active
 */
export function useHardwareManager() {
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastDetectRequestRef = useRef<string | null>(null)

  useEffect(() => {
    const checkForHardwareRequests = async () => {
      try {
        // Get storeId from auth store
        const storeId = useAuthStore.getState().user?.storeId
        if (!storeId) return

        // Check if there's a hardware detection request
        const statusResponse = await posApi.getHardwareDetectStatus()
        const { lastDetection, printerCount } = statusResponse.data

        // If printers are already detected, upload them periodically
        // to keep the server's printer list updated
        if (window.electronAPI?.listPrinters) {
          try {
            const result = await window.electronAPI.listPrinters()
            if (result.printers && result.printers.length > 0) {
              await posApi.uploadPrinters(result.printers, storeId)
            }
          } catch (e) {
            // Ignore errors - printer detection may not work in dev mode
          }
        }
      } catch (e) {
        // Silently ignore errors - hardware polling should not affect POS operation
      }
    }

    // Initial check
    checkForHardwareRequests()

    // Poll every 30 seconds
    intervalRef.current = setInterval(checkForHardwareRequests, 30000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])
}

/**
 * Request hardware detection from POS
 * Called when admin clicks "Detect Printers" button
 */
export async function requestHardwareDetection(): Promise<{ success: boolean; message: string }> {
  try {
    const storeId = useAuthStore.getState().user?.storeId
    if (!storeId) {
      return { success: false, message: 'Not logged in' }
    }

    // Trigger detection request on server
    const response = await posApi.requestHardwareDetect(storeId)
    
    // Immediately detect and upload printers
    if (window.electronAPI?.listPrinters) {
      try {
        const result = await window.electronAPI.listPrinters()
        if (result.printers && result.printers.length > 0) {
          await posApi.uploadPrinters(result.printers, storeId)
          return { 
            success: true, 
            message: `${result.printers.length} printer(s) detected: ${result.printers.join(', ')}` 
          }
        } else {
          return { success: true, message: 'No printers found on this computer' }
        }
      } catch (e: any) {
        return { success: false, message: `Detection failed: ${e.message}` }
      }
    }

    return { 
      success: true, 
      message: 'Detection requested. Printer list will update shortly.' 
    }
  } catch (e: any) {
    return { success: false, message: `Request failed: ${e.message}` }
  }
}

/**
 * Get detected printers from server
 */
export async function getDetectedPrinters(): Promise<{ printers: string[]; lastDetection: string | null }> {
  try {
    const response = await posApi.getDetectedPrinters()
    return {
      printers: response.data.printers || [],
      lastDetection: response.data.lastDetection
    }
  } catch (e) {
    return { printers: [], lastDetection: null }
  }
}

interface ElectronAPI {
  setApiUrl?: (url: string) => void
  getApiUrl?: () => string
  minimizeWindow?: () => void
  maximizeWindow?: () => void
  closeWindow?: () => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}

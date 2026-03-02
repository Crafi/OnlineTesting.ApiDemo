export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const value = (window as unknown as { __APP_CONFIG__?: { VITE_API_BASE_URL?: string } })
      .__APP_CONFIG__?.VITE_API_BASE_URL
    if (value && value !== '__VITE_API_BASE_URL__') {
      return value
    }
  }
  return import.meta.env.VITE_API_BASE_URL
}

export function getAppVersion(): string {
  if (typeof window !== 'undefined') {
    const value = (window as unknown as { __APP_CONFIG__?: { VITE_APP_VERSION?: string } })
      .__APP_CONFIG__?.VITE_APP_VERSION
    if (value && value !== '__VITE_APP_VERSION__') {
      return value
    }
  }
  return import.meta.env.VITE_APP_VERSION || 'dev'
}

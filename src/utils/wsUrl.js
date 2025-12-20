export function getWebSocketUrl() {
  if (typeof window === 'undefined') {
    return 'ws://localhost:3001'
  }

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const host = window.location.hostname || 'localhost'
  return `${protocol}://${host}:3001`
}

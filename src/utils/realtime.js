// Realtime.js — wraps Ably with a simple pub/sub interface
// Each call to connect() creates a FRESH Ably instance — never shared

import * as Ably from 'ably'

export function createRealtime(key, playerId) {
  // Fresh instance every time — this is critical for multi-tab
  const ably = new Ably.Realtime({
    key,
    clientId: playerId,
    // Disable automatic echo — we don't want to receive our own publishes
    echoMessages: false,
  })
  return ably
}

export function waitForConnection(ably) {
  return new Promise((resolve, reject) => {
    if (ably.connection.state === 'connected') { resolve(); return }
    ably.connection.once('connected', resolve)
    ably.connection.once('failed', reject)
    ably.connection.once('suspended', reject)
    setTimeout(() => reject(new Error('timeout')), 10000)
  })
}

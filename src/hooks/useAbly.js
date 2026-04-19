import { useRef, useEffect, useCallback } from 'react';
import * as Ably from 'ably';

// Each player connects to Ably directly using a public key (no server needed)
// All game messages go through Ably channels named by room code

let ablyClient = null;

export function getAblyClient() {
  if (!ablyClient) {
    const key = import.meta.env.VITE_ABLY_KEY;
    if (!key) {
      console.error('VITE_ABLY_KEY not set');
      return null;
    }
    ablyClient = new Ably.Realtime({ key, clientId: crypto.randomUUID() });
  }
  return ablyClient;
}

export function useAbly(roomCode, playerId, onMessage) {
  const channelRef = useRef(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!roomCode) return;
    const client = getAblyClient();
    if (!client) return;

    const channel = client.channels.get(`mafia-room-${roomCode}`);
    channelRef.current = channel;

    channel.subscribe((msg) => {
      try {
        const data = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data;
        // Only process messages not sent by us (Ably echoes back to sender too)
        onMessageRef.current(data);
      } catch (e) {
        console.error('Ably parse error', e);
      }
    });

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [roomCode]);

  const publish = useCallback((msg) => {
    if (channelRef.current) {
      channelRef.current.publish('game', JSON.stringify(msg));
    }
  }, []);

  return { publish };
}

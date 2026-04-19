import { useRef, useState, useEffect, useCallback } from 'react';
import * as Ably from 'ably';

// WebRTC voice chat — Ably is just the signaling layer
// Actual audio is peer-to-peer between browsers

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]
};

export function useVoiceChat(roomCode, playerId, playerName, enabled) {
  const [speaking, setSpeaking] = useState({}); // playerId -> bool
  const [muted, setMuted] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);

  const localStreamRef = useRef(null);
  const peersRef = useRef({}); // playerId -> RTCPeerConnection
  const audioRef = useRef({}); // playerId -> HTMLAudioElement
  const channelRef = useRef(null);
  const analyserRef = useRef({}); // playerId -> AnalyserNode
  const speakingTimersRef = useRef({});

  // ── Signaling channel ────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !roomCode || !playerId) return;
    const key = import.meta.env.VITE_ABLY_KEY;
    if (!key) return;

    const client = new Ably.Realtime({ key, clientId: playerId });
    const ch = client.channels.get(`mafia-voice-${roomCode}`);
    channelRef.current = ch;

    ch.subscribe((msg) => {
      const data = msg.data;
      if (!data || data.to !== playerId) return;
      handleSignal(data);
    });

    // Announce presence so others know to connect to us
    ch.publish('signal', { type: 'JOIN', from: playerId, name: playerName });

    return () => {
      ch.publish('signal', { type: 'LEAVE', from: playerId });
      ch.unsubscribe();
      cleanup();
    };
  }, [enabled, roomCode, playerId]);

  // ── Get microphone ───────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then(stream => {
        localStreamRef.current = stream;
        setConnected(true);
        setupVAD(stream, 'local');
      })
      .catch(err => {
        setError('Microphone access denied');
        console.error('Mic error:', err);
      });
    return () => localStreamRef.current?.getTracks().forEach(t => t.stop());
  }, [enabled]);

  // ── Voice activity detection ─────────────────────────────────
  function setupVAD(stream, pid) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      analyserRef.current[pid] = analyser;

      const buf = new Uint8Array(analyser.frequencyBinCount);
      function check() {
        analyser.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        const isSpeaking = avg > 15;
        setSpeaking(prev => {
          if (prev[pid] !== isSpeaking) return { ...prev, [pid]: isSpeaking };
          return prev;
        });
        speakingTimersRef.current[pid] = requestAnimationFrame(check);
      }
      check();
    } catch (e) { /* VAD not critical */ }
  }

  // ── Create peer connection ───────────────────────────────────
  function createPeer(remotePeerId, isInitiator) {
    if (peersRef.current[remotePeerId]) return peersRef.current[remotePeerId];

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peersRef.current[remotePeerId] = pc;

    // Add local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // ICE candidates → signal via Ably
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        channelRef.current?.publish('signal', {
          type: 'ICE', from: playerId, to: remotePeerId,
          candidate: candidate.toJSON()
        });
      }
    };

    // Remote audio stream
    pc.ontrack = ({ streams }) => {
      if (!streams[0]) return;
      let audio = audioRef.current[remotePeerId];
      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        audioRef.current[remotePeerId] = audio;
      }
      audio.srcObject = streams[0];
      setupVAD(streams[0], remotePeerId);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        pc.close();
        delete peersRef.current[remotePeerId];
      }
    };

    if (isInitiator) {
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => {
          channelRef.current?.publish('signal', {
            type: 'OFFER', from: playerId, to: remotePeerId,
            sdp: pc.localDescription.sdp
          });
        });
    }

    return pc;
  }

  // ── Handle incoming signals ──────────────────────────────────
  async function handleSignal(data) {
    const { type, from } = data;

    switch (type) {
      case 'JOIN': {
        // New peer joined — we initiate
        if (from !== playerId) createPeer(from, true);
        break;
      }
      case 'OFFER': {
        const pc = createPeer(from, false);
        await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        channelRef.current?.publish('signal', {
          type: 'ANSWER', from: playerId, to: from,
          sdp: pc.localDescription.sdp
        });
        break;
      }
      case 'ANSWER': {
        const pc = peersRef.current[from];
        if (pc) await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
        break;
      }
      case 'ICE': {
        const pc = peersRef.current[from];
        if (pc && data.candidate) {
          try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch {}
        }
        break;
      }
      case 'LEAVE': {
        const pc = peersRef.current[from];
        if (pc) { pc.close(); delete peersRef.current[from]; }
        const audio = audioRef.current[from];
        if (audio) { audio.srcObject = null; delete audioRef.current[from]; }
        break;
      }
    }
  }

  function cleanup() {
    Object.values(peersRef.current).forEach(pc => pc.close());
    peersRef.current = {};
    Object.values(audioRef.current).forEach(a => { a.srcObject = null; });
    audioRef.current = {};
    Object.values(speakingTimersRef.current).forEach(id => cancelAnimationFrame(id));
    speakingTimersRef.current = {};
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    setConnected(false);
  }

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setMuted(m => !m);
  }, []);

  return { speaking, muted, toggleMute, connected, error };
}

import { useRef, useState, useEffect, useCallback } from 'react'
import * as Ably from 'ably'

const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] }

export function useVoiceChat(roomCode, playerId, playerName, enabled) {
  const [speaking, setSpeaking] = useState({})
  const [muted, setMuted] = useState(false)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState(null)
  const localRef = useRef(null)
  const peers = useRef({})
  const audios = useRef({})
  const chRef = useRef(null)
  const ablyRef = useRef(null)
  const vadTimers = useRef({})

  function vad(stream, pid) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const src = ctx.createMediaStreamSource(stream)
      const an = ctx.createAnalyser(); an.fftSize = 512
      src.connect(an)
      const buf = new Uint8Array(an.frequencyBinCount)
      const check = () => {
        an.getByteFrequencyData(buf)
        const avg = buf.reduce((a,b)=>a+b,0)/buf.length
        setSpeaking(prev => prev[pid]!==(avg>15) ? {...prev,[pid]:avg>15} : prev)
        vadTimers.current[pid] = requestAnimationFrame(check)
      }
      check()
    } catch {}
  }

  useEffect(() => {
    if (!enabled || !roomCode || !playerId) return
    const key = import.meta.env.VITE_ABLY_KEY
    if (!key) return
    const ably = new Ably.Realtime({ key, clientId: `v-${playerId}` })
    ablyRef.current = ably
    const ch = ably.channels.get(`mfv-${roomCode}`)
    chRef.current = ch
    ch.subscribe(msg => { const d=msg.data; if (!d||d.to!==playerId) return; signal(d) })
    ch.publish({ type:'JOIN', from:playerId, name:playerName })
    return () => { ch.publish({ type:'LEAVE', from:playerId }); ch.unsubscribe(); cleanup() }
  }, [enabled, roomCode, playerId])

  useEffect(() => {
    if (!enabled) return
    navigator.mediaDevices.getUserMedia({ audio:true, video:false })
      .then(stream => { localRef.current=stream; setConnected(true); vad(stream,'local') })
      .catch(() => setError('Microphone access denied'))
    return () => localRef.current?.getTracks().forEach(t=>t.stop())
  }, [enabled])

  function makePeer(remoteId, initiator) {
    if (peers.current[remoteId]) return peers.current[remoteId]
    const pc = new RTCPeerConnection(ICE)
    peers.current[remoteId] = pc
    localRef.current?.getTracks().forEach(t => pc.addTrack(t, localRef.current))
    pc.onicecandidate = ({candidate}) => { if (candidate) chRef.current?.publish({ type:'ICE', from:playerId, to:remoteId, candidate:candidate.toJSON() }) }
    pc.ontrack = ({streams}) => {
      if (!streams[0]) return
      let a = audios.current[remoteId]
      if (!a) { a=new Audio(); a.autoplay=true; audios.current[remoteId]=a }
      a.srcObject=streams[0]; vad(streams[0], remoteId)
    }
    pc.onconnectionstatechange = () => { if (['failed','disconnected'].includes(pc.connectionState)) { pc.close(); delete peers.current[remoteId] } }
    if (initiator) {
      pc.createOffer().then(o=>pc.setLocalDescription(o)).then(()=>chRef.current?.publish({ type:'OFFER', from:playerId, to:remoteId, sdp:pc.localDescription.sdp }))
    }
    return pc
  }

  async function signal(d) {
    const { type, from } = d
    if (type==='JOIN' && from!==playerId) { makePeer(from, true) }
    else if (type==='OFFER') { const pc=makePeer(from,false); await pc.setRemoteDescription({type:'offer',sdp:d.sdp}); const a=await pc.createAnswer(); await pc.setLocalDescription(a); chRef.current?.publish({type:'ANSWER',from:playerId,to:from,sdp:pc.localDescription.sdp}) }
    else if (type==='ANSWER') { const pc=peers.current[from]; if(pc) await pc.setRemoteDescription({type:'answer',sdp:d.sdp}) }
    else if (type==='ICE') { const pc=peers.current[from]; if(pc&&d.candidate) try { await pc.addIceCandidate(new RTCIceCandidate(d.candidate)) } catch {} }
    else if (type==='LEAVE') { const pc=peers.current[from]; if(pc){pc.close();delete peers.current[from]}; const a=audios.current[from]; if(a){a.srcObject=null;delete audios.current[from]} }
  }

  function cleanup() {
    Object.values(peers.current).forEach(pc=>pc.close()); peers.current={}
    Object.values(audios.current).forEach(a=>{a.srcObject=null}); audios.current={}
    Object.values(vadTimers.current).forEach(id=>cancelAnimationFrame(id)); vadTimers.current={}
    localRef.current?.getTracks().forEach(t=>t.stop()); localRef.current=null
    setConnected(false)
  }

  const toggleMute = useCallback(() => {
    localRef.current?.getAudioTracks().forEach(t=>{t.enabled=!t.enabled})
    setMuted(m=>!m)
  }, [])

  return { speaking, muted, toggleMute, connected, error }
}

import { useState, useEffect, useRef } from 'react'
import { useGame } from '../context/GameContext'
import { sounds } from '../utils/sounds'
import { useVoiceChat } from '../hooks/useVoiceChat'

function VoteTimer({ seconds, active }) {
  const [rem, setRem] = useState(seconds)
  useEffect(() => {
    setRem(seconds)
    if (!active) return
    const id = setInterval(() => setRem(r => { if (r <= 1) sounds.tick(); return Math.max(0, r-1) }), 1000)
    return () => clearInterval(id)
  }, [seconds, active])
  if (!active) return null
  const pct = seconds > 0 ? (rem / seconds) * 100 : 0
  const urgent = rem <= 10
  return (
    <div className={`vote-timer ${urgent?'urgent':''}`}>
      <div className="vt-bar" style={{width:`${pct}%`,background:urgent?'#e53e3e':'#c9a84c'}}/>
      <span className="vt-text">{rem}s remaining</span>
    </div>
  )
}

function VoicePanel({ roomCode, playerId, playerName, players }) {
  const [on, setOn] = useState(false)
  const { speaking, muted, toggleMute, connected, error } = useVoiceChat(roomCode, playerId, playerName, on)
  return (
    <div className="voice-panel">
      <div className="voice-row">
        <span className="voice-label">🎙️ Voice Chat</span>
        <button className={`voice-btn ${on?'on':'off'}`} onClick={()=>setOn(v=>!v)}>
          {on ? (connected?'Leave':'Connecting...') : 'Join Voice'}
        </button>
      </div>
      {on && <>
        {error && <p className="voice-err">⚠️ {error}</p>}
        <div className="voice-players">
          {players.filter(p=>p.alive).map(p=>(
            <div key={p.id} className={`vp ${speaking[p.id]?'speaking':''} ${p.id===playerId?'me':''}`}>
              <div className={`vp-av ${speaking[p.id]?'pulse':''}`}>{p.avatar||p.name[0]}</div>
              <span className="vp-name">{p.name}{p.id===playerId?' (You)':''}</span>
              {speaking[p.id] && <span className="vp-dot">●</span>}
            </div>
          ))}
        </div>
        {connected && <button className={`mute-btn ${muted?'muted':''}`} onClick={toggleMute}>{muted?'🔇 Unmute':'🎙️ Mute'}</button>}
      </>}
    </div>
  )
}

export default function DayScreen() {
  const { state, actions } = useGame()
  const { players, playerId, playerName, roomCode, nightLog, votes, deadChat, voteTimerSeconds, voteTimerActive, gameLog, round, eliminatedPlayers, lastWills, myRole } = state
  const [voted, setVoted] = useState(false)
  const [myVote, setMyVote] = useState(null)
  const [showLog, setShowLog] = useState(false)
  const [mayorRevealed, setMayorRevealed] = useState(false)
  const deadRef = useRef(null)

  const alive = (players||[]).filter(p=>p.alive)
  const me = (players||[]).find(p=>p.id===playerId)
  const amAlive = me?.alive !== false

  useEffect(() => { sounds.day() }, [])
  useEffect(() => { deadRef.current?.scrollIntoView({behavior:'smooth'}) }, [deadChat])

  const summary = () => {
    if (!nightLog?.length) return 'Dawn breaks over the town...'
    const e = nightLog[0]
    if (e.type==='killed') return `☠️ ${e.name} was found dead this morning.`
    if (e.type==='saved') return `✨ The doctor saved someone — the town was spared.`
    if (e.type==='bodyguard_died') return `🛡️ ${e.name} the Bodyguard died protecting someone.`
    if (e.type==='peaceful') return `🌅 A peaceful night. No one was harmed.`
    if (e.type==='sheriff_hit') return `⭐ The Sheriff shot ${e.name} — a Mafia member!`
    if (e.type==='sheriff_miss') return `⭐ The Sheriff missed — both died.`
    if (e.type==='bomber') return `💣 ${e.bomberName} exploded, taking ${e.victimName}!`
    if (e.type==='witch_blocked') return `🧙 The Witch blocked an action last night.`
    return 'Dawn breaks...'
  }

  const vote = (id) => {
    if (!amAlive || voted) return
    sounds.vote()
    setMyVote(id); setVoted(true)
    actions.castVote(id)
  }

  const vCount = id => Object.values(votes||{}).filter(v=>v===id).length
  const totalVotes = Object.keys(votes||{}).length

  const recentWills = Object.entries(lastWills||{}).filter(([id,t])=>t&&eliminatedPlayers?.find(p=>p.id===id))

  return (
    <div className="screen day-screen">
      <div className="day-atm"/>
      <div className="day-content">

        <div className="day-header">
          <div className="day-icon">☀️</div>
          <h2>Day {round}</h2>
          <div className="night-report"><p>{summary()}</p></div>
          {nightLog?.slice(1).map((e,i)=>e.type==='bomber'&&(
            <div key={i} className="night-report sec"><p>💣 {e.bomberName} also killed {e.victimName}</p></div>
          ))}
        </div>

        {/* Last wills revealed */}
        {recentWills.map(([id,text])=>{
          const pl = eliminatedPlayers?.find(x=>x.id===id)
          return pl ? (
            <div key={id} className="will-reveal">
              <span>📜</span>
              <div><p className="will-name">{pl.name}'s Last Will:</p><p className="will-text">"{text}"</p></div>
            </div>
          ) : null
        })}

        {/* Mayor reveal */}
        {myRole==='mayor' && amAlive && !mayorRevealed && (
          <button className="mayor-btn" onClick={()=>setMayorRevealed(true)}>
            🏛️ Reveal as Mayor (double vote)
          </button>
        )}

        <VoteTimer seconds={voteTimerSeconds} active={voteTimerActive}/>
        <VoicePanel roomCode={roomCode} playerId={playerId} playerName={playerName} players={players||[]}/>

        <div className="vote-section">
          <div className="section-title">
            {voted?'Votes Cast':amAlive?'Vote to Eliminate':'Spectating'}
            <span className="badge">{totalVotes}/{alive.length}</span>
          </div>

          {!amAlive && <div className="dead-notice">You are eliminated. Watch the chaos unfold.</div>}

          <div className="vote-list">
            {alive.map(pl => {
              const count = vCount(pl.id)
              const isMe = pl.id===playerId
              const myv = myVote===pl.id
              const pct = alive.length>0?(count/alive.length)*100:0
              return (
                <button key={pl.id} className={`vote-btn ${myv?'myvote':''} ${voted||!amAlive?'readonly':''}`}
                  onClick={()=>!voted&&amAlive&&!isMe&&vote(pl.id)} disabled={isMe||voted||!amAlive}>
                  <div className="vote-fill" style={{width:`${pct}%`}}/>
                  <div className="vote-info">
                    <span className="v-av">{pl.avatar||'🎭'}</span>
                    <span className="v-name">{pl.name}{isMe?' (You)':''}</span>
                    <span className="v-count">{count>0?`${count} vote${count>1?'s':''}`:''}</span>
                  </div>
                  {myv && <span className="v-mark">YOUR VOTE</span>}
                </button>
              )
            })}
          </div>

          {amAlive && !voted && <button className="btn-ghost skip" onClick={()=>vote('skip')}>Skip vote</button>}
          {voted && <div className="waiting-votes"><div className="dots"><span/><span/><span/></div><p>Waiting for all votes...</p></div>}
        </div>

        {/* Dead chat */}
        {!amAlive && (
          <div className="dead-chat-area">
            <p className="chat-label" style={{color:'#718096'}}>☠️ Dead Chat</p>
            <div className="chat-box" style={{'--cc':'#718096'}}>
              <div className="chat-msgs">
                {!(deadChat||[]).length && <p className="chat-empty">No messages yet...</p>}
                {(deadChat||[]).map((m,i)=>(
                  <div key={i} className="chat-row">
                    <span className="chat-av">{m.avatar||'🎭'}</span>
                    <span className="chat-name">{m.sender}:</span>
                    <span className="chat-txt">{m.text}</span>
                  </div>
                ))}
                <div ref={deadRef}/>
              </div>
              <DeadInput onSend={actions.sendDeadChat}/>
            </div>
          </div>
        )}

        {/* Game log */}
        {(gameLog||[]).length>0 && (
          <div className="log-section">
            <button className="btn-ghost log-tog" onClick={()=>setShowLog(v=>!v)}>
              📜 {showLog?'Hide':'Show'} Game Log ({gameLog.length})
            </button>
            {showLog && (
              <div className="game-log">
                {gameLog.map((e,i)=>(
                  <div key={i} className={`log-row ${e.event}`}>
                    <span className="log-rd">R{e.round}{e.phase==='night'?' 🌙':' ☀️'}</span>
                    <span>{e.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function DeadInput({ onSend }) {
  const [t, setT] = useState('')
  const send = () => { if (!t.trim()) return; onSend(t.trim()); setT('') }
  return (
    <div className="chat-input">
      <input value={t} onChange={e=>setT(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} placeholder="Chat with the dead..." maxLength={120}/>
      <button onClick={send} style={{background:'#718096'}}>→</button>
    </div>
  )
}

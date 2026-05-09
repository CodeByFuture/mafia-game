import { useState } from 'react'
import { useGame } from '../context/GameContext'

const ROLES = [
  { k:'hasDoctor', l:'Doctor', i:'💉', d:'Saves one per night' },
  { k:'hasDetective', l:'Detective', i:'🔍', d:'Investigates one per night' },
  { k:'hasSheriff', l:'Sheriff', i:'⭐', d:'One risky shot' },
  { k:'hasGodfather', l:'Godfather', i:'🎩', d:'Appears innocent' },
  { k:'hasJester', l:'Jester', i:'🤡', d:'Wins if voted out' },
  { k:'hasBomber', l:'Bomber', i:'💣', d:'Kills on death' },
  { k:'hasWitch', l:'Witch', i:'🧙', d:'Blocks one action' },
  { k:'hasMayor', l:'Mayor', i:'🏛️', d:'Double vote' },
  { k:'hasBodyguard', l:'Bodyguard', i:'🛡️', d:'Dies protecting target' },
]

export default function LobbyScreen() {
  const { state, actions } = useGame()
  const { players, playerId, hostId, roomCode, settings } = state
  const [copied, setCopied] = useState(false)
  const isHost = playerId === hostId
  const canStart = players.length >= 4

  const copy = () => { navigator.clipboard?.writeText(roomCode).catch(()=>{}); setCopied(true); setTimeout(()=>setCopied(false),2000) }
  const shareLink = () => { navigator.clipboard?.writeText(`${window.location.origin}?join=${roomCode}`).catch(()=>{}); setCopied(true); setTimeout(()=>setCopied(false),2000) }
  const upd = s => actions.updateSettings(s)
  const tog = k => upd({ [k]: !settings[k] })

  return (
    <div className="screen lobby-screen">
      <div className="lobby-top">
        <div className="room-code-box" onClick={copy}>
          <span className="rc-label">ROOM CODE — TAP TO COPY</span>
          <span className="rc-code">{roomCode}</span>
          {copied && <span className="rc-copied">Copied!</span>}
        </div>
        <button className="share-btn" onClick={shareLink}>🔗 Copy invite link</button>
      </div>

      <div className="lobby-body">
        <div className="section">
          <div className="section-title">Players <span className="badge">{players.length}/20</span></div>
          <div className="players-list">
            {players.map(pl => (
              <div key={pl.id} className={`player-row ${pl.id===playerId?'me':''}`}>
                <span className="pl-av">{pl.avatar||'🎭'}</span>
                <span className="pl-name">{pl.name}</span>
                {pl.id===hostId && <span className="badge-host">HOST</span>}
                {pl.id===playerId && <span className="badge-you">YOU</span>}
                {isHost && pl.id!==playerId && <button className="kick-btn" onClick={()=>actions.kickPlayer(pl.id)}>✕</button>}
              </div>
            ))}
            {players.length < 4 && <p className="need-more">Need {4-players.length} more player{4-players.length>1?'s':''}</p>}
          </div>
        </div>

        {isHost ? (
          <div className="section">
            <div className="section-title">Settings</div>

            <div className="setting-row">
              <span>🔫 Mafia Count</span>
              <div className="num-ctrl">
                <button onClick={()=>upd({mafiaCount:Math.max(1,settings.mafiaCount-1)})}>−</button>
                <span>{settings.mafiaCount}</span>
                <button onClick={()=>upd({mafiaCount:Math.min(Math.floor(players.length/3)||1,settings.mafiaCount+1)})}>+</button>
              </div>
            </div>

            {settings.hasJester && (
              <div className="setting-row jester-row">
                <span>🤡 Jester Count</span>
                <div className="num-ctrl">
                  <button onClick={()=>upd({jesterCount:Math.max(1,(settings.jesterCount||1)-1)})}>−</button>
                  <span>{settings.jesterCount||1}</span>
                  <button onClick={()=>upd({jesterCount:Math.min(3,(settings.jesterCount||1)+1)})}>+</button>
                </div>
              </div>
            )}

            <div className="setting-row">
              <span>⏱️ Vote Timer</span>
              <div className="num-ctrl">
                <button onClick={()=>upd({voteTimerSeconds:Math.max(0,settings.voteTimerSeconds-15)})}>−</button>
                <span>{settings.voteTimerSeconds>0?`${settings.voteTimerSeconds}s`:'OFF'}</span>
                <button onClick={()=>upd({voteTimerSeconds:settings.voteTimerSeconds+15})}>+</button>
              </div>
            </div>

            <div className="setting-row">
              <span>🔒 Password</span>
              <input className="pass-input" placeholder="Optional" value={settings.password||''}
                onChange={e=>upd({password:e.target.value})} maxLength={12}/>
            </div>

            <div className="roles-grid">
              {ROLES.map(r => (
                <button key={r.k} className={`role-tog ${settings[r.k]?'on':'off'}`} onClick={()=>tog(r.k)}>
                  <span className="rt-i">{r.i}</span>
                  <span className="rt-l">{r.l}</span>
                  <span className="rt-d">{r.d}</span>
                  <span className={`rt-s ${settings[r.k]?'on':'off'}`}>{settings[r.k]?'ON':'OFF'}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="waiting-box">
            <div className="dots"><span/><span/><span/></div>
            <p>Waiting for host to start...</p>
          </div>
        )}

        {state.error && <div className="err-msg" onClick={actions.clearError}>⚠️ {state.error}</div>}

        {isHost && (
          <button className={`btn-primary ${!canStart?'disabled':''}`} onClick={canStart?actions.startGame:undefined}>
            Start Game ({players.length} players)
          </button>
        )}
      </div>
    </div>
  )
}

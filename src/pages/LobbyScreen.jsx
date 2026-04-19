import { useState } from 'react';
import { useGame } from '../context/GameContext';

const ROLE_SETTINGS = [
  { key:'hasDoctor',    label:'Doctor',     icon:'💉', desc:'Saves one per night' },
  { key:'hasDetective', label:'Detective',  icon:'🔍', desc:'Investigates one per night' },
  { key:'hasSheriff',   label:'Sheriff',    icon:'⭐', desc:'One risky shot per game' },
  { key:'hasGodfather', label:'Godfather',  icon:'🎩', desc:'Mafia boss, appears innocent' },
  { key:'hasJester',    label:'Jester',     icon:'🤡', desc:'Wins if voted out' },
  { key:'hasBomber',    label:'Bomber',     icon:'💣', desc:'Kills someone on death' },
  { key:'hasWitch',     label:'Witch',      icon:'🧙', desc:'Blocks one action per game' },
  { key:'hasMayor',     label:'Mayor',      icon:'🏛️', desc:'Double vote when revealed' },
  { key:'hasBodyguard', label:'Bodyguard',  icon:'🛡️', desc:'Dies protecting their target' },
];

export default function LobbyScreen() {
  const { state, actions } = useGame();
  const { players, spectators, playerId, hostId, roomCode, settings, rolesInGame } = state;
  const [copied, setCopied] = useState(false);
  const [showRoles, setShowRoles] = useState(false);

  const isHost = playerId === hostId;
  const canStart = players.length >= 4;
  const toggle = (key) => actions.updateSettings({ [key]: !settings[key] });
  const setMafiaCount = (n) => actions.updateSettings({ mafiaCount: Math.max(1, Math.min(Math.floor(players.length/3)||1, n)) });
  const setJesterCount = (n) => actions.updateSettings({ jesterCount: Math.max(1, Math.min(3, n)) });

  const copyCode = () => {
    navigator.clipboard?.writeText(roomCode).catch(()=>{});
    setCopied(true); setTimeout(()=>setCopied(false), 2000);
  };
  const shareLink = () => {
    navigator.clipboard?.writeText(`${window.location.origin}?join=${roomCode}`).catch(()=>{});
    setCopied(true); setTimeout(()=>setCopied(false), 2000);
  };

  return (
    <div className="screen lobby-screen">
      <div className="lobby-header">
        <div className="room-code-display" onClick={copyCode}>
          <span className="room-label">ROOM CODE — TAP TO COPY</span>
          <span className="room-code">{roomCode}</span>
          {copied && <span className="copied-badge">Copied!</span>}
        </div>
        <button className="share-link-btn" onClick={shareLink}>🔗 Copy invite link</button>
      </div>

      <div className="lobby-body">
        {/* Players list */}
        <div className="players-section">
          <h3 className="section-title">Players <span className="player-count">{players.length}/20</span></h3>
          <div className="players-list">
            {players.map(p => (
              <div key={p.id} className={`player-chip ${p.id===playerId?'me':''}`}>
                <span className="player-avatar-emoji">{p.avatar || '🎭'}</span>
                <span className="player-name">{p.name}</span>
                {p.id===hostId && <span className="host-badge">HOST</span>}
                {p.id===playerId && <span className="me-badge">YOU</span>}
                {isHost && p.id!==playerId && (
                  <button className="kick-btn" onClick={()=>actions.kickPlayer(p.id)} title="Kick player">✕</button>
                )}
              </div>
            ))}
            {spectators.length > 0 && (
              <div className="spectators-row">
                <span className="spec-label">👁️ Watching:</span>
                {spectators.map(s => <span key={s.id} className="spec-name">{s.avatar} {s.name}</span>)}
              </div>
            )}
            {!canStart && <p className="min-players-note">Need {4-players.length} more player{4-players.length>1?'s':''}</p>}
          </div>
        </div>

        {isHost ? (
          <div className="settings-section">
            <h3 className="section-title">Game Settings</h3>

            <div className="setting-row">
              <span className="setting-label">🔫 Mafia Count</span>
              <div className="number-control">
                <button onClick={()=>setMafiaCount(settings.mafiaCount-1)}>−</button>
                <span>{settings.mafiaCount}</span>
                <button onClick={()=>setMafiaCount(settings.mafiaCount+1)}>+</button>
              </div>
            </div>

            {settings.hasJester && (
              <div className="setting-row highlight-jester">
                <span className="setting-label">🤡 Jester Count</span>
                <div className="number-control">
                  <button onClick={()=>setJesterCount((settings.jesterCount||1)-1)}>−</button>
                  <span>{settings.jesterCount||1}</span>
                  <button onClick={()=>setJesterCount((settings.jesterCount||1)+1)}>+</button>
                </div>
              </div>
            )}

            <div className="setting-row">
              <span className="setting-label">⏱️ Vote Timer</span>
              <div className="number-control">
                <button onClick={()=>actions.updateSettings({voteTimerSeconds:Math.max(0,settings.voteTimerSeconds-15)})}>−</button>
                <span>{settings.voteTimerSeconds>0?`${settings.voteTimerSeconds}s`:'OFF'}</span>
                <button onClick={()=>actions.updateSettings({voteTimerSeconds:settings.voteTimerSeconds+15})}>+</button>
              </div>
            </div>

            <div className="setting-row">
              <span className="setting-label">🔒 Room Password</span>
              <input className="password-input" type="text" placeholder="Optional"
                value={settings.password||''} maxLength={12}
                onChange={e=>actions.updateSettings({password:e.target.value})} />
            </div>

            <div className="roles-grid">
              {ROLE_SETTINGS.map(r => (
                <button key={r.key} className={`role-toggle ${settings[r.key]?'on':'off'}`} onClick={()=>toggle(r.key)}>
                  <span className="rt-icon">{r.icon}</span>
                  <span className="rt-label">{r.label}</span>
                  <span className="rt-desc">{r.desc}</span>
                  <span className={`rt-status ${settings[r.key]?'on':'off'}`}>{settings[r.key]?'ON':'OFF'}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="waiting-box">
            <div className="waiting-dots"><span/><span/><span/></div>
            <p>Waiting for host to start...</p>
          </div>
        )}

        {state.error && <div className="error-msg" onClick={actions.clearError}>⚠️ {state.error}</div>}

        {isHost && (
          <button className={`btn btn-primary ${!canStart?'disabled':''}`} onClick={canStart?actions.startGame:undefined}>
            Start Game ({players.length} players)
          </button>
        )}
      </div>
    </div>
  );
}

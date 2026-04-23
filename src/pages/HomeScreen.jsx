import { useState } from 'react';
import { useGame } from '../context/GameContext';

const AVATARS = ['🎭','🕵️','🔫','💀','🎩','🤡','👻','🐺','🦊','🐱','🧙','⚔️','🃏','🌙','🔥','💣','🗡️','🎪','🦹','🧛'];

export default function HomeScreen() {
  const { state, actions } = useGame();
  const [tab, setTab] = useState('join');
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [password, setPassword] = useState('');
  const [avatar, setAvatar] = useState('🎭');
  const [showAvatars, setShowAvatars] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCreate = () => { if (!name.trim()) return; setLoading(true); actions.createRoom(name.trim(), avatar); };
  const handleJoin = () => { if (!name.trim() || !roomCode.trim()) return; setLoading(true); actions.joinRoom(name.trim(), avatar, roomCode.trim().toUpperCase(), password); };

  return (
    <div className="screen home-screen">
      <div className="home-bg">
        <div className="smoke smoke-1"/><div className="smoke smoke-2"/><div className="smoke smoke-3"/>
      </div>
      <div className="home-content">
        <div className="logo-area">
          <div className="logo-eyebrow">A GAME OF DECEPTION</div>
          <h1 className="logo-title">MAFIA</h1>
          <div className="logo-divider">
            <span className="divider-line"/><span className="divider-icon">🃏</span><span className="divider-line"/>
          </div>
          <p className="logo-sub">Trust no one. The night is long.</p>
        </div>

        <div className="card glass-card">
          <div className="tab-row">
            <button className={`tab-btn ${tab==='join'?'active':''}`} onClick={()=>setTab('join')}>Join Game</button>
            <button className={`tab-btn ${tab==='create'?'active':''}`} onClick={()=>setTab('create')}>Host Game</button>
          </div>
          <div className="form-body">
            <div className="avatar-row">
              <button className="avatar-pick-btn" onClick={()=>setShowAvatars(v=>!v)}>
                <span className="chosen-avatar">{avatar}</span>
                <span className="avatar-pick-label">Pick avatar</span>
              </button>
              {showAvatars && (
                <div className="avatar-grid">
                  {AVATARS.map(a=>(
                    <button key={a} className={`avatar-opt ${avatar===a?'selected':''}`} onClick={()=>{setAvatar(a);setShowAvatars(false);}}>
                      {a}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="field">
              <label>Your Name</label>
              <input type="text" placeholder="Enter your name..." value={name}
                onChange={e=>setName(e.target.value)} maxLength={16}
                onKeyDown={e=>e.key==='Enter'&&(tab==='create'?handleCreate():handleJoin())}/>
            </div>
            {tab==='join' && (
              <>
                <div className="field">
                  <label>Room Code</label>
                  <input type="text" placeholder="e.g. XK9A2" value={roomCode}
                    onChange={e=>setRoomCode(e.target.value.toUpperCase())} maxLength={6} className="code-input"/>
                </div>
                <div className="field">
                  <label>Password (if required)</label>
                  <input type="password" placeholder="Leave blank if none" value={password} onChange={e=>setPassword(e.target.value)}/>
                </div>
              </>
            )}
            {tab==='create' && <div className="host-note"><span>🌐</span><span>Share the room code with friends anywhere!</span></div>}
            {state.error && <div className="error-msg" onClick={actions.clearError}>⚠️ {state.error}</div>}
            <button className={`btn btn-primary ${loading?'disabled':''}`}
              onClick={loading?null:tab==='create'?handleCreate:handleJoin}>
              {loading?'Connecting...':tab==='create'?'Create Room':'Join Room'}
            </button>
          </div>
        </div>

        <div className="how-to-play">
          <details>
            <summary>How to play</summary>
            <div className="rules">
              <p><strong>🌙 Night:</strong> Mafia picks a victim. Doctor saves one. Detective investigates.</p>
              <p><strong>☀️ Day:</strong> Discuss and vote to eliminate a suspect.</p>
              <p><strong>🏆 Win:</strong> Civilians eliminate all Mafia. Mafia wins when they equal civilians.</p>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

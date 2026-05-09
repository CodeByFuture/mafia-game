import { useState } from 'react'
import { useGame } from '../context/GameContext'

const AVATARS = ['🎭','🕵️','🔫','💀','🎩','🤡','👻','🐺','🦊','🐱','🧙','⚔️','🃏','🌙','🔥','💣','🗡️','🎪','🦹','🧛']

export default function HomeScreen() {
  const { state, actions } = useGame()
  const [tab, setTab] = useState('join')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [pass, setPass] = useState('')
  const [avatar, setAvatar] = useState('🎭')
  const [showAv, setShowAv] = useState(false)
  const [loading, setLoading] = useState(false)

  const create = async () => { if (!name.trim()) return; setLoading(true); try { await actions.createRoom(name.trim(), avatar) } catch { setLoading(false) } }
  const join = async () => { if (!name.trim() || !code.trim()) return; setLoading(true); try { await actions.joinRoom(name.trim(), avatar, code.trim().toUpperCase(), pass) } catch { setLoading(false) } }

  return (
    <div className="screen home-screen">
      <div className="home-bg"><div className="smoke s1"/><div className="smoke s2"/><div className="smoke s3"/></div>
      <div className="home-content">
        <div className="logo-area">
          <div className="logo-eyebrow">A GAME OF DECEPTION</div>
          <h1 className="logo-title">MAFIA</h1>
          <div className="logo-divider"><span className="dl"/><span>🃏</span><span className="dl"/></div>
          <p className="logo-sub">Trust no one. The night is long.</p>
        </div>

        <div className="glass-card">
          <div className="tab-row">
            <button className={`tab-btn ${tab==='join'?'active':''}`} onClick={()=>setTab('join')}>Join Game</button>
            <button className={`tab-btn ${tab==='create'?'active':''}`} onClick={()=>setTab('create')}>Host Game</button>
          </div>
          <div className="form-body">
            {/* Avatar */}
            <div className="av-row">
              <button className="av-btn" onClick={()=>setShowAv(v=>!v)}>
                <span className="av-chosen">{avatar}</span>
                <span className="av-label">Pick avatar {showAv ? '▲' : '▼'}</span>
              </button>
              {showAv && (
                <div className="av-grid">
                  {AVATARS.map(a=>(
                    <button key={a} className={`av-opt ${avatar===a?'sel':''}`} onClick={()=>{setAvatar(a);setShowAv(false)}}>{a}</button>
                  ))}
                </div>
              )}
            </div>

            <div className="field">
              <label>Your Name</label>
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="Enter your name..." maxLength={16}
                onKeyDown={e=>e.key==='Enter'&&(tab==='create'?create():join())}/>
            </div>

            {tab==='join' && <>
              <div className="field">
                <label>Room Code</label>
                <input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="e.g. XK9A2" maxLength={6} className="code-input"/>
              </div>
              <div className="field">
                <label>Password (if required)</label>
                <input type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="Leave blank if none"/>
              </div>
            </>}

            {tab==='create' && <div className="host-note"><span>🌐</span><span>Anyone can join with your room code!</span></div>}

            {state.error && <div className="err-msg" onClick={actions.clearError}>⚠️ {state.error}</div>}

            <button className={`btn-primary ${loading?'loading':''}`} onClick={loading?null:tab==='create'?create:join}>
              {loading ? <><span className="spinner"/>Connecting...</> : tab==='create' ? 'Create Room' : 'Join Room'}
            </button>
          </div>
        </div>

        <details className="how-to">
          <summary>How to play</summary>
          <div className="rules">
            <p><b>🌙 Night:</b> Mafia picks a victim. Doctor saves one. Detective investigates.</p>
            <p><b>☀️ Day:</b> Discuss and vote to eliminate a suspect.</p>
            <p><b>🏆 Win:</b> Town eliminates all Mafia — or Mafia outnumber Town.</p>
          </div>
        </details>
      </div>
    </div>
  )
}

import { useState, useRef, useEffect } from 'react'
import { useGame } from '../context/GameContext'
import { sounds } from '../utils/sounds'

const PROMPTS = {
  mafia:        { t:'Choose your victim',    i:'🔫', c:'#e53e3e', s:'Select a target to eliminate tonight' },
  godfather:    { t:'Who will you silence?', i:'🎩', c:'#9b2335', s:'Direct your Mafia to strike' },
  doctor:       { t:'Who will you save?',    i:'💉', c:'#48bb78', s:'Choose one person to protect tonight' },
  detective:    { t:'Investigate a suspect', i:'🔍', c:'#4299e1', s:'Learn if this person is Mafia' },
  sheriff:      { t:'Take your shot',         i:'⭐', c:'#ecc94b', s:'Hit Mafia they die — miss and you both die' },
  sheriff_used: { t:'Shot already used',     i:'⭐', c:'#718096', s:'Rest tonight.' },
  jester:       { t:'Play the fool',          i:'🤡', c:'#ed64a6', s:'Get them to vote you out tomorrow!' },
  bomber:       { t:'Wait for your moment',  i:'💣', c:'#f6ad55', s:'When you die, someone comes with you.' },
  witch:        { t:'Cast your spell',       i:'🧙', c:'#9f7aea', s:"Block one player's action, or pass." },
  mayor:        { t:'You are the Mayor',     i:'🏛️', c:'#f6e05e', s:'Reveal yourself tomorrow for double vote.' },
  bodyguard:    { t:'Protect someone',       i:'🛡️', c:'#68d391', s:'You will die in their place if Mafia targets them.' },
  civilian:     { t:'Close your eyes',       i:'😴', c:'#718096', s:'You are asleep. Others act in the dark.' },
  dead:         { t:'You are dead',          i:'☠️', c:'#4a5568', s:'Chat with the other dead.' },
}

function Chat({ messages, onSend, placeholder, color }) {
  const [text, setText] = useState('')
  const bottom = useRef(null)
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  const send = () => { if (!text.trim()) return; onSend(text.trim()); setText('') }
  return (
    <div className="chat-box" style={{ '--cc': color }}>
      <div className="chat-msgs">
        {!messages.length && <p className="chat-empty">No messages yet...</p>}
        {messages.map((m, i) => (
          <div key={i} className="chat-row">
            <span className="chat-av">{m.avatar||'🎭'}</span>
            <span className="chat-name">{m.sender}:</span>
            <span className="chat-txt">{m.text}</span>
          </div>
        ))}
        <div ref={bottom}/>
      </div>
      <div className="chat-input">
        <input value={text} onChange={e=>setText(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&send()} placeholder={placeholder} maxLength={120}/>
        <button onClick={send} style={{ background: color }}>→</button>
      </div>
    </div>
  )
}

export default function NightScreen() {
  const { state, actions } = useGame()
  const { nightAction, actionConfirmed, detectiveResult, mafiaChat, deadChat } = state
  const [selected, setSelected] = useState(null)
  const [witchMode, setWitchMode] = useState(null)

  useEffect(() => { sounds.night() }, [])

  if (!nightAction) return (
    <div className="screen night-screen">
      <div className="night-atm"/>
      <Stars/>
      <div className="night-center">
        <div className="moon">🌙</div>
        <h2>Night Falls...</h2>
        <div className="dots"><span/><span/><span/></div>
      </div>
    </div>
  )

  const { role, targets } = nightAction
  const pr = PROMPTS[role] || PROMPTS.civilian
  const isMafiaRole = role === 'mafia' || role === 'godfather'
  const isPassive = ['civilian','jester','bomber','sheriff_used','dead','mayor'].includes(role)
  const isDead = role === 'dead'

  const submit = (targetId, actionType) => { actions.submitNightAction(targetId || 'none', actionType); setSelected(null) }

  return (
    <div className="screen night-screen">
      <div className="night-atm"/>
      <Stars/>
      <div className="night-content">
        <div className="night-header">
          <div className="night-icon" style={{ color: pr.c }}>{pr.i}</div>
          <h2 className="night-title" style={{ color: pr.c }}>{pr.t}</h2>
          <p className="night-sub">{pr.s}</p>
        </div>

        {/* Detective result — shows immediately */}
        {detectiveResult && (
          <div className="det-result" style={{ borderColor: detectiveResult.isMafia ? '#e53e3e' : '#48bb78' }}>
            <div className="det-icon">{detectiveResult.isMafia ? '🔴' : '🟢'}</div>
            <p className="det-name">{detectiveResult.targetName}</p>
            <p className="det-verdict" style={{ color: detectiveResult.isMafia ? '#e53e3e' : '#48bb78' }}>
              {detectiveResult.isMafia ? 'IS MAFIA' : 'IS INNOCENT'}
            </p>
          </div>
        )}

        {!actionConfirmed ? <>
          {/* Target list */}
          {!isPassive && !detectiveResult && role !== 'witch' && targets.length > 0 && (
            <div className="targets">
              {targets.map(t => (
                <button key={t.id} className={`target-btn ${selected===t.id?'sel':''}`}
                  style={{'--tc':pr.c}} onClick={()=>setSelected(t.id)}>
                  <span className="t-av">{t.avatar||'🎭'}</span>
                  <span className="t-name">{t.name}</span>
                  {selected===t.id && <span className="t-check">✓</span>}
                </button>
              ))}
            </div>
          )}

          {/* Witch */}
          {role === 'witch' && (
            <div className="witch-ui">
              {!witchMode ? (
                <div className="witch-choice">
                  <button className="btn-primary" style={{background:nightAction.blockUsed?'#4a5568':'#9f7aea'}}
                    disabled={nightAction.blockUsed} onClick={()=>!nightAction.blockUsed&&setWitchMode('block')}>
                    {nightAction.blockUsed ? '🧙 Block Used' : '🧙 Block a player'}
                  </button>
                  <button className="btn-ghost" onClick={()=>submit('none','pass')}>😴 Pass tonight</button>
                </div>
              ) : <>
                <p style={{color:'#9f7aea',textAlign:'center',marginBottom:8}}>Choose who to block:</p>
                <div className="targets">
                  {targets.map(t => (
                    <button key={t.id} className={`target-btn ${selected===t.id?'sel':''}`}
                      style={{'--tc':'#9f7aea'}} onClick={()=>setSelected(t.id)}>
                      <span className="t-av">{t.avatar||'🎭'}</span>
                      <span className="t-name">{t.name}</span>
                      {selected===t.id && <span className="t-check">✓</span>}
                    </button>
                  ))}
                </div>
                <button className={`btn-primary ${!selected?'disabled':''}`}
                  style={{background:selected?'#9f7aea':undefined,width:'100%',marginTop:8}}
                  onClick={()=>selected&&submit(selected,'block')}>Cast Block</button>
              </>}
            </div>
          )}

          {/* Passive */}
          {isPassive && !isDead && (
            <div className="passive-night">
              <div className="passive-icon">
                {role==='jester'?'😈':role==='bomber'?'💣':role==='mayor'?'🏛️':'💤'}
              </div>
              <p>{role==='jester'?'Plan your mischief — get voted out tomorrow!':
                  role==='bomber'?"You're waiting. Someone's in for a surprise.":
                  role==='mayor'?'Rest tonight. Reveal yourself tomorrow for double vote.':
                  role==='sheriff_used'?'Your shot is used. Rest.':'You are asleep...'}</p>
              <button className="btn-ghost" onClick={()=>submit('none')}>Got it</button>
            </div>
          )}

          {isDead && <Chat messages={deadChat} onSend={actions.sendDeadChat} placeholder="Chat with the dead..." color="#4a5568"/>}

          {!isPassive && !isDead && role !== 'witch' && (
            <button className={`btn-primary ${(!selected&&!detectiveResult)?'disabled':''}`}
              style={{background:(selected||detectiveResult)?pr.c:undefined,width:'100%',marginTop:12}}
              onClick={()=>(selected||detectiveResult)?submit(selected):null}>
              {detectiveResult ? "I've seen enough" : 'Confirm Action'}
            </button>
          )}
        </> : (
          <div className="action-done">
            {!detectiveResult && <div className="confirmed"><span>✓</span><p>Action submitted</p></div>}
            <div className="waiting-dawn">
              <div className="dots"><span/><span/><span/></div>
              <p>Waiting for others...</p>
            </div>
          </div>
        )}

        {/* Mafia chat */}
        {isMafiaRole && (
          <div className="mafia-chat">
            <p className="chat-label" style={{color:'#e53e3e'}}>🔴 Mafia Chat</p>
            <Chat messages={mafiaChat} onSend={actions.sendMafiaChat} placeholder="Message your team..." color="#e53e3e"/>
          </div>
        )}
      </div>
    </div>
  )
}

function Stars() {
  return (
    <div className="stars">
      {Array.from({length:20},(_,i)=>(
        <div key={i} className="star" style={{left:`${(i*17+5)%100}%`,top:`${(i*13+3)%60}%`,animationDelay:`${(i*0.3)%3}s`}}/>
      ))}
    </div>
  )
}

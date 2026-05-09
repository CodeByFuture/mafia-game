import { useState } from 'react'
import { useGame } from '../context/GameContext'

const INFO = {
  mafia:     { e:'🔫', t:'MAFIA',     c:'#e53e3e', g:'rgba(229,62,62,0.4)',   d:'Kill one civilian each night. Stay hidden.',               f:'"Everyone is guilty of something."' },
  godfather: { e:'🎩', t:'GODFATHER',  c:'#9b2335', g:'rgba(155,35,53,0.5)',  d:'Lead the Mafia. You appear innocent to the Detective.',   f:'"An offer he can\'t refuse."' },
  doctor:    { e:'💉', t:'DOCTOR',     c:'#48bb78', g:'rgba(72,187,120,0.4)',  d:'Protect one person each night from being killed.',        f:'"First, do no harm."' },
  detective: { e:'🔍', t:'DETECTIVE',  c:'#4299e1', g:'rgba(66,153,225,0.4)',  d:'Investigate one player each night.',                      f:'"The truth always surfaces."' },
  sheriff:   { e:'⭐', t:'SHERIFF',    c:'#ecc94b', g:'rgba(236,201,75,0.4)',  d:'One shot — hit Mafia they die, miss and you both die.',   f:'"Justice comes at a price."' },
  jester:    { e:'🤡', t:'JESTER',     c:'#ed64a6', g:'rgba(237,100,166,0.4)', d:'You WIN if the town votes you out. Be suspicious!',       f:'"The joke is on all of you."' },
  bomber:    { e:'💣', t:'BOMBER',     c:'#f6ad55', g:'rgba(246,173,85,0.4)',  d:'When you die, a random player dies with you.',            f:'"Going out with a bang."' },
  witch:     { e:'🧙', t:'WITCH',      c:'#9f7aea', g:'rgba(159,122,234,0.4)', d:'Block one player\'s night action once per game.',         f:'"I see what you\'re planning."' },
  mayor:     { e:'🏛️', t:'MAYOR',      c:'#f6e05e', g:'rgba(246,224,94,0.4)',  d:'Reveal yourself for double vote power.',                  f:'"The people have spoken."' },
  bodyguard: { e:'🛡️', t:'BODYGUARD',  c:'#68d391', g:'rgba(104,211,145,0.4)', d:'Protect someone each night. You die in their place.',     f:'"Taking a bullet for you."' },
  civilian:  { e:'🏘️', t:'CIVILIAN',   c:'#c9a84c', g:'rgba(201,168,76,0.4)',  d:'No special power. Discuss, deduce, vote out the Mafia.', f:'"Together we stand."' },
}

export default function RoleRevealScreen() {
  const { state, actions } = useGame()
  const { myRole, mafiaTeam, myLastWill, rolesInGame } = state
  const [revealed, setRevealed] = useState(false)
  const [will, setWill] = useState(myLastWill || '')
  const info = INFO[myRole] || INFO.civilian

  return (
    <div className="screen role-reveal-screen">
      <div className="role-bg" style={{'--glow':info.g}}/>
      <div className="role-content">
        <p className="role-hint">{revealed ? 'Your role this game:' : 'Your role has been assigned'}</p>

        <div className={`role-card ${revealed?'open':'closed'}`} style={{'--rc':info.c,'--glow':info.g}}
          onClick={()=>!revealed&&setRevealed(true)}>
          {!revealed ? (
            <div className="card-back">
              <div className="card-q">?</div>
              <p className="tap-to-reveal">Tap to reveal your role</p>
              <p className="privacy-warn">⚠️ Make sure no one else is watching</p>
            </div>
          ) : (
            <div className="card-front">
              <div className="role-emoji">{info.e}</div>
              <div className="role-title" style={{color:info.c}}>{info.t}</div>
              <div className="role-desc">{info.d}</div>
              {mafiaTeam.length > 0 && (
                <div className="mafia-team">
                  <p className="team-label">Your Mafia team:</p>
                  {mafiaTeam.map(m=><span key={m.id} className="team-member">{m.avatar} {m.name}{m.role==='godfather'?' 👑':''}</span>)}
                </div>
              )}
              <div className="role-flavor">{info.f}</div>
            </div>
          )}
        </div>

        {revealed && <>
          {rolesInGame.length > 0 && (
            <div className="roles-in-game">
              <p className="rig-label">Roles in this game:</p>
              <div className="rig-chips">
                {rolesInGame.map(r=><span key={r} className="rig-chip" style={{color:INFO[r]?.c||'#aaa'}}>{INFO[r]?.e} {r}</span>)}
              </div>
            </div>
          )}
          <div className="last-will">
            <p className="lw-label">📜 Last Will <span className="lw-hint">(shown when you die)</span></p>
            <textarea className="lw-input" placeholder="Write a message revealed on your death..."
              value={will} onChange={e=>setWill(e.target.value)} maxLength={200} rows={3}
              onBlur={()=>actions.saveLastWill(will)}/>
          </div>
          <div className="waiting-night">
            <div className="dots"><span/><span/><span/></div>
            <p>Night is approaching...</p>
          </div>
        </>}
      </div>
    </div>
  )
}

import { useState } from 'react';
import { useGame } from '../context/GameContext';

const ROLE_INFO = {
  mafia:     { emoji:'🔫', title:'MAFIA',     color:'#e53e3e', glow:'rgba(229,62,62,0.4)',   desc:'Pick a target each night. Blend in during the day.',            flavor:'"Everyone is guilty of something."' },
  godfather: { emoji:'🎩', title:'GODFATHER',  color:'#9b2335', glow:'rgba(155,35,53,0.5)',  desc:'Lead the Mafia. Detective sees you as innocent.',               flavor:'"An offer he can\'t refuse."' },
  doctor:    { emoji:'💉', title:'DOCTOR',     color:'#48bb78', glow:'rgba(72,187,120,0.4)',  desc:'Protect one person each night from being killed.',              flavor:'"First, do no harm."' },
  detective: { emoji:'🔍', title:'DETECTIVE',  color:'#4299e1', glow:'rgba(66,153,225,0.4)',  desc:'Investigate one player each night to learn if they\'re Mafia.', flavor:'"The truth always surfaces."' },
  sheriff:   { emoji:'⭐', title:'SHERIFF',    color:'#ecc94b', glow:'rgba(236,201,75,0.4)',  desc:'One shot at night — hit Mafia and they die, miss and you both die.', flavor:'"Justice comes at a price."' },
  jester:    { emoji:'🤡', title:'JESTER',     color:'#ed64a6', glow:'rgba(237,100,166,0.4)', desc:'You WIN if the town votes you out. Act suspicious!',            flavor:'"The joke is on all of you."' },
  bomber:    { emoji:'💣', title:'BOMBER',     color:'#f6ad55', glow:'rgba(246,173,85,0.4)',  desc:'When you die, a random player dies with you.',                  flavor:'"Going out with a bang."' },
  witch:     { emoji:'🧙', title:'WITCH',      color:'#9f7aea', glow:'rgba(159,122,234,0.4)', desc:'Once per game, block someone\'s night action.',                 flavor:'"I see what you\'re planning."' },
  mayor:     { emoji:'🏛️', title:'MAYOR',      color:'#f6e05e', glow:'rgba(246,224,94,0.4)',  desc:'Your vote counts double — but only after you publicly reveal yourself.', flavor:'"The people have spoken."' },
  bodyguard: { emoji:'🛡️', title:'BODYGUARD',  color:'#68d391', glow:'rgba(104,211,145,0.4)', desc:'Protect someone each night. You die in their place.',           flavor:'"Taking a bullet for you."' },
  civilian:  { emoji:'🏘️', title:'CIVILIAN',   color:'#c9a84c', glow:'rgba(201,168,76,0.4)',  desc:'No special powers — discuss, deduce, vote out the Mafia.',     flavor:'"Together we stand."' },
};

export default function RoleRevealScreen() {
  const { state } = useGame();
  const { myRole, mafiaTeam, myLastWill, rolesInGame } = state;
  const [revealed, setRevealed] = useState(false);
  const [will, setWill] = useState(myLastWill || '');
  const { actions } = useGame();
  const info = ROLE_INFO[myRole] || ROLE_INFO.civilian;

  const saveWill = () => actions.saveLastWill(will);

  return (
    <div className="screen role-reveal-screen">
      <div className="role-bg" style={{'--role-glow':info.glow}} />
      <div className="role-content">
        <p className="role-instruction">{revealed ? 'Your role this game:' : 'Your role has been assigned'}</p>

        <div className={`role-card ${revealed?'revealed':'hidden'}`}
          onClick={()=>!revealed&&setRevealed(true)}
          style={{'--role-color':info.color,'--role-glow':info.glow}}>
          {!revealed ? (
            <div className="card-back">
              <div className="card-back-pattern">?</div>
              <p className="tap-hint">Tap to reveal your role</p>
              <p className="privacy-hint">⚠️ Make sure no one else is watching</p>
            </div>
          ) : (
            <div className="card-front">
              <div className="role-emoji">{info.emoji}</div>
              <div className="role-title" style={{color:info.color}}>{info.title}</div>
              <div className="role-desc">{info.desc}</div>
              {mafiaTeam.length > 0 && (
                <div className="mafia-team">
                  <p className="team-label">Your Mafia team:</p>
                  {mafiaTeam.map(m=>(
                    <span key={m.id} className="team-member">{m.avatar||'🎭'} {m.name}{m.role==='godfather'?' 👑':''}</span>
                  ))}
                </div>
              )}
              <div className="role-flavor">{info.flavor}</div>
            </div>
          )}
        </div>

        {revealed && (
          <>
            {/* Last will */}
            <div className="last-will-section">
              <p className="last-will-label">📜 Last Will <span className="last-will-hint">(revealed when you die)</span></p>
              <textarea className="last-will-input" placeholder="Write a message to be revealed on your death..."
                value={will} onChange={e=>setWill(e.target.value)} maxLength={200}
                onBlur={saveWill} rows={3} />
            </div>

            {/* Roles in this game */}
            {rolesInGame.length > 0 && (
              <div className="roles-in-game">
                <p className="rig-label">Roles in this game:</p>
                <div className="rig-chips">
                  {rolesInGame.map(r => (
                    <span key={r} className="rig-chip" style={{color: ROLE_INFO[r]?.color || '#aaa'}}>
                      {ROLE_INFO[r]?.emoji} {r}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="waiting-for-night">
              <div className="waiting-dots"><span/><span/><span/></div>
              <p>The night is approaching...</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

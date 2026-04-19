import { useState, useRef, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import { sounds } from '../utils/sounds';

const NIGHT_PROMPTS = {
  mafia:        { title:'Choose your victim',     icon:'🔫', color:'#e53e3e', subtitle:'Select a target to eliminate tonight' },
  godfather:    { title:'Who will you silence?',  icon:'🎩', color:'#9b2335', subtitle:'Direct your Mafia to strike' },
  doctor:       { title:'Who will you save?',     icon:'💉', color:'#48bb78', subtitle:'Choose one person to protect tonight' },
  detective:    { title:'Investigate a suspect',  icon:'🔍', color:'#4299e1', subtitle:'Learn if this person is Mafia' },
  sheriff:      { title:'Take your shot',          icon:'⭐', color:'#ecc94b', subtitle:'Shoot someone — Mafia dies, innocent means you both die' },
  sheriff_used: { title:'Shot already fired',     icon:'⭐', color:'#718096', subtitle:'You already used your shot. Rest tonight.' },
  jester:       { title:'Play the fool',           icon:'🤡', color:'#ed64a6', subtitle:'Get them to vote you out tomorrow.' },
  bomber:       { title:'Wait for your moment',   icon:'💣', color:'#f6ad55', subtitle:'When you die, someone comes with you.' },
  witch:        { title:'Cast your spell',        icon:'🧙', color:'#9f7aea', subtitle:"Block one player's action, or pass." },
  mayor:        { title:'You are the Mayor',      icon:'🏛️', color:'#f6e05e', subtitle:'Sleep tonight. Tomorrow you can reveal yourself for double vote.' },
  bodyguard:    { title:'Who will you protect?',  icon:'🛡️', color:'#68d391', subtitle:'You will die in their place if Mafia targets them.' },
  civilian:     { title:'Close your eyes',        icon:'😴', color:'#718096', subtitle:'You are asleep. Others act in the dark.' },
  dead:         { title:'You are dead',           icon:'☠️', color:'#4a5568', subtitle:'Chat with the other dead.' },
};

function ChatPanel({ messages, onSend, placeholder, color }) {
  const [text, setText] = useState('');
  const bottomRef = useRef(null);
  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:'smooth'}); }, [messages]);
  const send = () => { if(!text.trim()) return; onSend(text.trim()); setText(''); };
  return (
    <div className="chat-panel" style={{'--chat-color':color}}>
      <div className="chat-messages">
        {messages.length===0 && <p className="chat-empty">No messages yet...</p>}
        {messages.map((m,i)=>(
          <div key={i} className="chat-msg">
            <span className="chat-avatar">{m.avatar||'🎭'}</span>
            <span className="chat-sender">{m.sender}:</span>
            <span className="chat-text">{m.text}</span>
          </div>
        ))}
        <div ref={bottomRef}/>
      </div>
      <div className="chat-input-row">
        <input value={text} onChange={e=>setText(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&send()}
          placeholder={placeholder} maxLength={120}/>
        <button onClick={send} style={{background:color}}>→</button>
      </div>
    </div>
  );
}

export default function NightScreen() {
  const { state, actions } = useGame();
  const { nightAction, actionConfirmed, detectiveResult, mafiaChat, deadChat } = state;
  const [selected, setSelected] = useState(null);
  const [witchMode, setWitchMode] = useState(null);

  useEffect(()=>{ sounds.night(); }, []);

  if (!nightAction) return (
    <div className="screen night-screen">
      <div className="night-atmosphere"/>
      <div className="night-center">
        <div className="moon">🌙</div>
        <h2>Night Falls...</h2>
        <div className="waiting-dots"><span/><span/><span/></div>
      </div>
    </div>
  );

  const { role, targets } = nightAction;
  const prompt = NIGHT_PROMPTS[role] || NIGHT_PROMPTS.civilian;
  const isMafia = role==='mafia'||role==='godfather';
  const isPassive = ['civilian','jester','bomber','sheriff_used','dead','mayor'].includes(role);
  const isDead = role==='dead';

  const handleSubmit = (targetId, actionType) => {
    actions.submitNightAction(targetId||'none', actionType);
    setSelected(null);
  };

  return (
    <div className="screen night-screen">
      <div className="night-atmosphere"/>
      <div className="stars">
        {[...Array(20)].map((_,i)=>(
          <div key={i} className="star" style={{left:`${(i*17+5)%100}%`,top:`${(i*13+3)%60}%`,animationDelay:`${(i*0.3)%3}s`}}/>
        ))}
      </div>
      <div className="night-content">
        <div className="night-header">
          <div className="night-icon" style={{color:prompt.color}}>{prompt.icon}</div>
          <h2 className="night-title" style={{color:prompt.color}}>{prompt.title}</h2>
          <p className="night-subtitle">{prompt.subtitle}</p>
        </div>

        {detectiveResult && (
          <div className="detective-result" style={{borderColor:detectiveResult.isMafia?'#e53e3e':'#48bb78'}}>
            <div className="result-icon">{detectiveResult.isMafia?'🔴':'🟢'}</div>
            <p className="result-name">{detectiveResult.targetName}</p>
            <p className="result-verdict" style={{color:detectiveResult.isMafia?'#e53e3e':'#48bb78'}}>
              {detectiveResult.isMafia?'IS MAFIA':'IS INNOCENT'}
            </p>
          </div>
        )}

        {!actionConfirmed ? (
          <>
            {/* Target list */}
            {!isPassive && !detectiveResult && role!=='witch' && targets.length>0 && (
              <div className="targets-list">
                {targets.map(t=>(
                  <button key={t.id} className={`target-btn ${selected===t.id?'selected':''}`}
                    style={{'--role-color':prompt.color}} onClick={()=>setSelected(t.id)}>
                    <span className="target-avatar-emoji">{t.avatar||'🎭'}</span>
                    <span className="target-name">{t.name}</span>
                    {selected===t.id && <span className="check">✓</span>}
                  </button>
                ))}
              </div>
            )}

            {/* Witch UI */}
            {role==='witch' && (
              <div className="witch-panel">
                {!witchMode ? (
                  <div className="witch-choice">
                    <button className="btn btn-primary witch-btn"
                      style={{background:nightAction.blockUsed?'#4a5568':'#9f7aea'}}
                      disabled={nightAction.blockUsed}
                      onClick={()=>!nightAction.blockUsed&&setWitchMode('block')}>
                      {nightAction.blockUsed?'🧙 Block Used':'🧙 Block a player'}
                    </button>
                    <button className="btn btn-ghost witch-btn" onClick={()=>handleSubmit('none','pass')}>😴 Pass tonight</button>
                  </div>
                ) : (
                  <>
                    <p className="witch-instruction" style={{color:'#9f7aea'}}>Choose who to block:</p>
                    <div className="targets-list">
                      {targets.map(t=>(
                        <button key={t.id} className={`target-btn ${selected===t.id?'selected':''}`}
                          style={{'--role-color':'#9f7aea'}} onClick={()=>setSelected(t.id)}>
                          <span className="target-avatar-emoji">{t.avatar||'🎭'}</span>
                          <span className="target-name">{t.name}</span>
                          {selected===t.id&&<span className="check">✓</span>}
                        </button>
                      ))}
                    </div>
                    <button className={`btn btn-primary night-submit ${!selected?'disabled':''}`}
                      style={{background:selected?'#9f7aea':undefined}}
                      onClick={()=>selected&&handleSubmit(selected,'block')}>Cast Block</button>
                  </>
                )}
              </div>
            )}

            {/* Passive roles */}
            {isPassive && !isDead && (
              <div className="civilian-night">
                <div className="zzz">{role==='jester'?'😈':role==='bomber'?'💣':role==='mayor'?'🏛️':'💤'}</div>
                <p>{role==='jester'?'Plan your mischief. Get voted out tomorrow!':
                   role==='bomber'?"You're waiting. Someone's in for a surprise.":
                   role==='mayor'?'Rest tonight. Reveal yourself tomorrow to get double vote.':
                   role==='sheriff_used'?'Your shot is used. Rest.':
                   'You are asleep...'}</p>
                <button className="btn btn-ghost" onClick={()=>handleSubmit('none')}>Got it</button>
              </div>
            )}

            {isDead && <ChatPanel messages={deadChat} onSend={actions.sendDeadChat} placeholder="Chat with the dead..." color="#4a5568"/>}

            {!isPassive && !isDead && role!=='witch' && (
              <button className={`btn btn-primary night-submit ${(!selected&&!detectiveResult)?'disabled':''}`}
                style={{background:(selected||detectiveResult)?prompt.color:undefined}}
                onClick={()=>(selected||detectiveResult)?handleSubmit(selected):null}>
                {detectiveResult?"I've seen enough":'Confirm Action'}
              </button>
            )}
          </>
        ) : (
          <div className="action-done">
            {!detectiveResult && <div className="confirmed-msg"><span>✓</span><p>Action submitted</p></div>}
            <div className="waiting-for-dawn">
              <div className="waiting-dots"><span/><span/><span/></div>
              <p>Waiting for others...</p>
            </div>
          </div>
        )}

        {isMafia && (
          <div className="mafia-chat-section">
            <p className="chat-title" style={{color:'#e53e3e'}}>🔴 Mafia Chat</p>
            <ChatPanel messages={mafiaChat} onSend={actions.sendMafiaChat} placeholder="Message your team..." color="#e53e3e"/>
          </div>
        )}
      </div>
    </div>
  );
}

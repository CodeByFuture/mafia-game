import { useState, useEffect, useRef } from 'react';
import { useGame } from '../context/GameContext';
import { useVoiceChat } from '../hooks/useVoiceChat';
import { sounds } from '../utils/sounds';

function VoteTimer({ seconds, active }) {
  const [remaining, setRemaining] = useState(seconds);
  useEffect(()=>{
    setRemaining(seconds);
    if(!active) return;
    const id = setInterval(()=>setRemaining(r=>{
      if(r<=1) { sounds.tick(); }
      return Math.max(0,r-1);
    }),1000);
    return ()=>clearInterval(id);
  },[seconds,active]);
  if(!active) return null;
  const pct = seconds>0?(remaining/seconds)*100:0;
  const urgent = remaining<=10;
  return (
    <div className={`vote-timer ${urgent?'urgent':''}`}>
      <div className="timer-bar" style={{width:`${pct}%`,background:urgent?'#e53e3e':'#c9a84c'}}/>
      <span className="timer-text">{remaining}s remaining</span>
    </div>
  );
}

function VoicePanel({ roomCode, playerId, playerName, players }) {
  const [voiceOn, setVoiceOn] = useState(false);
  const { speaking, muted, toggleMute, connected, error } = useVoiceChat(roomCode, playerId, playerName, voiceOn);
  return (
    <div className="voice-panel">
      <div className="voice-header">
        <span className="voice-title">🎙️ Voice Chat</span>
        <button className={`voice-toggle-btn ${voiceOn?'on':'off'}`} onClick={()=>setVoiceOn(v=>!v)}>
          {voiceOn?(connected?'Leave Voice':'Connecting...'):'Join Voice'}
        </button>
      </div>
      {voiceOn && (
        <>
          {error && <p className="voice-error">⚠️ {error}</p>}
          <div className="voice-players">
            {players.filter(p=>p.alive).map(p=>(
              <div key={p.id} className={`voice-player ${speaking[p.id]?'speaking':''} ${p.id===playerId?'me':''}`}>
                <div className={`voice-avatar ${speaking[p.id]?'pulse':''}`}>{p.avatar||p.name[0]}</div>
                <span className="voice-name">{p.name}{p.id===playerId?' (You)':''}</span>
                {speaking[p.id]&&<span className="speaking-dot">●</span>}
              </div>
            ))}
          </div>
          {connected && <button className={`mute-btn ${muted?'muted':''}`} onClick={toggleMute}>{muted?'🔇 Unmute':'🎙️ Mute'}</button>}
        </>
      )}
    </div>
  );
}

export default function DayScreen() {
  const { state, actions } = useGame();
  const { players, playerId, playerName, roomCode, nightLog, votes, deadChat, voteTimerSeconds, voteTimerActive, gameLog, round, eliminatedPlayers, lastWills, myRole } = state;
  const [voted, setVoted] = useState(false);
  const [myVote, setMyVote] = useState(null);
  const [showLog, setShowLog] = useState(false);
  const [mayorRevealed, setMayorRevealed] = useState(false);

  const alivePlayers = (players||[]).filter(p=>p.alive);
  const me = (players||[]).find(p=>p.id===playerId);
  const amAlive = me?.alive!==false;
  const deadChatRef = useRef(null);

  useEffect(()=>{ sounds.day(); }, []);
  useEffect(()=>{ deadChatRef.current?.scrollIntoView({behavior:'smooth'}); }, [deadChat]);

  const nightSummary = ()=>{
    if(!nightLog?.length) return 'Dawn breaks over the town...';
    const e = nightLog[0];
    if(e.type==='killed') return `☠️ ${e.name} was found dead this morning.`;
    if(e.type==='saved') return `✨ The doctor (or bodyguard) saved someone tonight.`;
    if(e.type==='bodyguard_died') return `🛡️ ${e.name} the Bodyguard died protecting someone.`;
    if(e.type==='peaceful') return `🌅 A peaceful night. No one was harmed.`;
    if(e.type==='sheriff_hit') return `⭐ The Sheriff shot ${e.name} — a Mafia member!`;
    if(e.type==='sheriff_miss') return `⭐ The Sheriff missed — both died.`;
    if(e.type==='bomber') return `💣 ${e.bomberName} exploded, taking ${e.victimName}!`;
    if(e.type==='witch_blocked') return `🧙 The Witch blocked an action last night.`;
    return 'Dawn breaks...';
  };

  const handleVote = (targetId) => {
    if(!amAlive||voted) return;
    sounds.vote();
    setMyVote(targetId); setVoted(true);
    actions.castVote(targetId);
  };

  const revealMayor = () => {
    setMayorRevealed(true);
    // The double-vote is handled in engine via mayorRevealed flag
  };

  const voteCount = (id) => Object.values(votes||{}).filter(v=>v===id).length;
  const totalVotes = Object.keys(votes||{}).length;

  // Show last wills of recently eliminated players
  const recentWills = Object.entries(lastWills||{}).filter(([id, text]) => text && eliminatedPlayers.find(p=>p.id===id));

  return (
    <div className="screen day-screen">
      <div className="day-atmosphere"/>
      <div className="day-content">
        <div className="day-header">
          <div className="day-icon">☀️</div>
          <h2>Day {round}</h2>
          <div className="night-report"><p>{nightSummary()}</p></div>
        </div>

        {/* Last wills revealed */}
        {recentWills.map(([id, text])=>{
          const p = eliminatedPlayers.find(x=>x.id===id);
          return (
            <div key={id} className="last-will-reveal">
              <span className="lw-icon">📜</span>
              <div>
                <p className="lw-name">{p?.name}'s Last Will:</p>
                <p className="lw-text">"{text}"</p>
              </div>
            </div>
          );
        })}

        {/* Mayor reveal button */}
        {myRole==='mayor' && amAlive && !mayorRevealed && (
          <button className="mayor-reveal-btn" onClick={revealMayor}>
            🏛️ Reveal yourself as Mayor (double vote)
          </button>
        )}

        <VoteTimer seconds={voteTimerSeconds} active={voteTimerActive}/>

        <VoicePanel roomCode={roomCode} playerId={playerId} playerName={playerName} players={players||[]}/>

        <div className="voting-section">
          <h3 className="section-title">
            {voted?'Votes Cast':amAlive?'Vote to Eliminate':'Spectating'}
            <span className="vote-tally">{totalVotes}/{alivePlayers.length}</span>
          </h3>

          {!amAlive && <div className="dead-notice">You are eliminated. Watch the chaos unfold.</div>}

          <div className="vote-list">
            {alivePlayers.map(p=>{
              const count = voteCount(p.id);
              const isMe = p.id===playerId;
              const iVotedThis = myVote===p.id;
              const pct = alivePlayers.length>0?(count/alivePlayers.length)*100:0;
              return (
                <button key={p.id}
                  className={`vote-btn ${iVotedThis?'my-vote':''} ${voted||!amAlive?'view-only':''}`}
                  onClick={()=>!voted&&amAlive&&!isMe&&handleVote(p.id)}
                  disabled={isMe||voted||!amAlive}>
                  <div className="vote-bar" style={{width:`${pct}%`}}/>
                  <div className="vote-info">
                    <span className="vote-avatar-emoji">{p.avatar||'🎭'}</span>
                    <span className="vote-name">{p.name}{isMe?' (You)':''}</span>
                    <span className="vote-count">{count>0?`${count} vote${count>1?'s':''}`:''}</span>
                  </div>
                  {iVotedThis&&<span className="my-vote-mark">YOUR VOTE</span>}
                </button>
              );
            })}
          </div>

          {amAlive&&!voted&&<button className="btn btn-ghost skip-btn" onClick={()=>handleVote('skip')}>Skip vote</button>}
          {voted&&(
            <div className="waiting-resolve">
              <div className="waiting-dots"><span/><span/><span/></div>
              <p>Waiting for all votes...</p>
            </div>
          )}
        </div>

        {/* Dead chat */}
        {!amAlive && (
          <div className="dead-chat-section">
            <p className="chat-title" style={{color:'#718096'}}>☠️ Dead Chat</p>
            <div className="chat-panel" style={{'--chat-color':'#718096'}}>
              <div className="chat-messages">
                {(deadChat||[]).length===0&&<p className="chat-empty">No messages yet...</p>}
                {(deadChat||[]).map((m,i)=>(
                  <div key={i} className="chat-msg">
                    <span className="chat-avatar">{m.avatar||'🎭'}</span>
                    <span className="chat-sender">{m.sender}:</span>
                    <span className="chat-text">{m.text}</span>
                  </div>
                ))}
                <div ref={deadChatRef}/>
              </div>
              <DeadInput onSend={actions.sendDeadChat}/>
            </div>
          </div>
        )}

        {/* Game log */}
        {(gameLog||[]).length>0&&(
          <div className="game-log-section">
            <button className="btn btn-ghost log-toggle" onClick={()=>setShowLog(v=>!v)}>
              📜 {showLog?'Hide':'Show'} Game Log ({gameLog.length} events)
            </button>
            {showLog&&(
              <div className="game-log">
                {gameLog.map((e,i)=>(
                  <div key={i} className={`log-entry ${e.event}`}>
                    <span className="log-round">R{e.round} {e.phase==='night'?'🌙':'☀️'}</span>
                    <span className="log-text">{e.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DeadInput({ onSend }) {
  const [text, setText] = useState('');
  const send = ()=>{ if(!text.trim()) return; onSend(text.trim()); setText(''); };
  return (
    <div className="chat-input-row">
      <input value={text} onChange={e=>setText(e.target.value)}
        onKeyDown={e=>e.key==='Enter'&&send()}
        placeholder="Chat with the dead..." maxLength={120}/>
      <button onClick={send} style={{background:'#718096'}}>→</button>
    </div>
  );
}

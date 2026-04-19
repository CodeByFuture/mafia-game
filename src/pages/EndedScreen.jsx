import { useEffect, useState, useRef } from 'react';
import confetti from 'canvas-confetti';
import { useGame } from '../context/GameContext';
import { isMafiaRole } from '../engine';
import { sounds } from '../utils/sounds';

const ROLE_COLORS = {
  mafia:'#e53e3e', godfather:'#9b2335', doctor:'#48bb78', detective:'#4299e1',
  sheriff:'#ecc94b', jester:'#ed64a6', bomber:'#f6ad55', witch:'#9f7aea',
  mayor:'#f6e05e', bodyguard:'#68d391', civilian:'#c9a84c'
};
const ROLE_EMOJIS = {
  mafia:'🔫', godfather:'🎩', doctor:'💉', detective:'🔍', sheriff:'⭐',
  jester:'🤡', bomber:'💣', witch:'🧙', mayor:'🏛️', bodyguard:'🛡️', civilian:'🏘️'
};

function loadStats(name) {
  try { return JSON.parse(localStorage.getItem('mafia_stats')||'{}')[name] || null; } catch { return null; }
}
function saveStats(name, role, iWon) {
  try {
    const all = JSON.parse(localStorage.getItem('mafia_stats')||'{}');
    const cur = all[name] || { wins:0, losses:0, gamesPlayed:0, roleHistory:[] };
    cur.gamesPlayed++; cur.roleHistory = [...(cur.roleHistory||[]), role];
    if(iWon) cur.wins++; else cur.losses++;
    all[name] = cur;
    localStorage.setItem('mafia_stats', JSON.stringify(all));
    return cur;
  } catch { return null; }
}

export default function EndedScreen() {
  const { state, actions } = useGame();
  const { players, playerId, playerName, myRole, winner, jesterWinner, gameLog, eliminatedPlayers, lastWills, mvpVotes, mvpResult } = state;
  const [tab, setTab] = useState('results');
  const [myStats, setMyStats] = useState(null);
  const [mvpVoted, setMvpVoted] = useState(false);
  const didInit = useRef(false);

  const isHost = playerId === state.hostId;
  const iWon = (winner==='mafia'&&isMafiaRole(myRole))
    ||(winner==='civilians'&&!isMafiaRole(myRole)&&myRole!=='jester')
    ||(winner==='jester'&&myRole==='jester');

  useEffect(()=>{
    if(didInit.current) return;
    didInit.current = true;
    const stats = saveStats(playerName, myRole, iWon);
    setMyStats(stats);
    if(iWon) {
      sounds.win();
      setTimeout(()=>{
        confetti({ particleCount:150, spread:80, origin:{y:0.6}, colors:['#c9a84c','#e8c97a','#ffffff','#f6ad55'] });
      }, 300);
    } else {
      sounds.lose();
    }
  }, []);

  const winnerLabel = winner==='mafia'?'MAFIA WINS':winner==='jester'?'JESTER WINS':'TOWN WINS';
  const winnerIcon = winner==='mafia'?'🔫':winner==='jester'?'🤡':'⚖️';
  const winnerSub = winner==='mafia'?'The criminals took over the town.'
    :winner==='jester'?`${jesterWinner} fooled everyone into voting them out!`
    :'Justice prevails. The Mafia has been defeated.';

  const castMvp = (targetId) => {
    if(mvpVoted) return;
    setMvpVoted(true);
    actions.castMvpVote(targetId);
  };

  // Build leaderboard from all players stats
  const leaderboard = (players||[]).map(p=>{
    const s = loadStats(p.name);
    return { ...p, stats: s };
  }).filter(p=>p.stats).sort((a,b)=>(b.stats.wins-a.stats.wins));

  return (
    <div className="screen ended-screen">
      <div className={`ended-bg winner-${winner}`}/>
      <div className="ended-content">
        <div className="winner-announcement">
          <div className="winner-icon">{winnerIcon}</div>
          <h1 className="winner-title">{winnerLabel}</h1>
          <p className="winner-subtitle">{winnerSub}</p>
          <div className={`my-outcome ${iWon?'won':'lost'}`}>{iWon?'🏆 You Won!':'💀 You Lost'}</div>
        </div>

        {mvpResult && (
          <div className="mvp-banner">
            <span className="mvp-crown">👑</span>
            <span>MVP: <strong>{mvpResult.avatar} {mvpResult.name}</strong></span>
            <span className="mvp-votes">{mvpResult.votes} votes</span>
          </div>
        )}

        <div className="ended-tabs">
          <button className={`etab ${tab==='results'?'active':''}`} onClick={()=>setTab('results')}>Results</button>
          <button className={`etab ${tab==='mvp'?'active':''}`} onClick={()=>setTab('mvp')}>👑 MVP</button>
          <button className={`etab ${tab==='log'?'active':''}`} onClick={()=>setTab('log')}>Log</button>
          <button className={`etab ${tab==='stats'?'active':''}`} onClick={()=>setTab('stats')}>Stats</button>
          <button className={`etab ${tab==='board'?'active':''}`} onClick={()=>setTab('board')}>🏆</button>
        </div>

        {tab==='results' && (
          <>
            <div className="reveal-section">
              <h3 className="section-title">Roles Revealed</h3>
              <div className="role-reveal-grid">
                {(players||[]).map(p=>(
                  <div key={p.id} className={`revealed-player ${p.alive?'alive':'dead'}`}>
                    <span className="rev-avatar-emoji">{p.avatar||'🎭'}</span>
                    <span className="rev-name">{p.name}{p.id===playerId?' (You)':''}</span>
                    <span className="rev-role" style={{color:ROLE_COLORS[p.role]||'#c9a84c',background:`${ROLE_COLORS[p.role]||'#c9a84c'}22`}}>
                      {ROLE_EMOJIS[p.role]} {p.role?.toUpperCase()}
                    </span>
                    {!p.alive&&<span className="dead-mark">☠</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Last wills */}
            {Object.entries(lastWills||{}).some(([,t])=>t) && (
              <div className="wills-section">
                <h3 className="section-title">Last Wills</h3>
                {Object.entries(lastWills||{}).filter(([,t])=>t).map(([id,text])=>{
                  const p = (players||[]).find(x=>x.id===id);
                  return p ? (
                    <div key={id} className="last-will-reveal">
                      <span className="lw-icon">📜</span>
                      <div><p className="lw-name">{p.avatar} {p.name}:</p><p className="lw-text">"{text}"</p></div>
                    </div>
                  ) : null;
                })}
              </div>
            )}

            {(eliminatedPlayers||[]).length>0&&(
              <div className="elim-log">
                <h3 className="section-title">Elimination Log</h3>
                {eliminatedPlayers.map((p,i)=>(
                  <div key={i} className="elim-entry">
                    <span>{p.reason==='night_kill'?'🌙':p.reason==='bomber'?'💣':p.reason==='voted'?'☀️':'⭐'}</span>
                    <span className="elim-round">R{p.round}</span>
                    <span className="elim-name">{p.name}</span>
                    <span className="elim-role" style={{color:ROLE_COLORS[p.role]||'#aaa'}}>{p.role}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab==='mvp' && (
          <div className="mvp-section">
            <h3 className="section-title">Vote for MVP</h3>
            {mvpResult ? (
              <div className="mvp-result-big">
                <div className="mvp-avatar-big">{mvpResult.avatar}</div>
                <p className="mvp-name-big">{mvpResult.name}</p>
                <p className="mvp-sub">Most Valuable Player</p>
              </div>
            ) : (
              <>
                <p className="mvp-hint">Who played the best this game?</p>
                <div className="mvp-grid">
                  {(players||[]).filter(p=>p.id!==playerId).map(p=>(
                    <button key={p.id}
                      className={`mvp-btn ${mvpVotes[playerId]===p.id?'selected':''} ${mvpVoted?'voted':''}`}
                      onClick={()=>castMvp(p.id)} disabled={mvpVoted}>
                      <span className="mvp-avatar">{p.avatar||'🎭'}</span>
                      <span className="mvp-pname">{p.name}</span>
                      <span className="mvp-role" style={{color:ROLE_COLORS[p.role]}}>{ROLE_EMOJIS[p.role]}</span>
                      <span className="mvp-vote-count">{Object.values(mvpVotes||{}).filter(v=>v===p.id).length} votes</span>
                    </button>
                  ))}
                </div>
                {mvpVoted&&<p className="mvp-waiting">Waiting for others to vote...</p>}
              </>
            )}
          </div>
        )}

        {tab==='log' && (
          <div className="game-log full">
            <h3 className="section-title">Full Game Log</h3>
            {!(gameLog?.length)&&<p className="log-empty">No events recorded.</p>}
            {(gameLog||[]).map((e,i)=>(
              <div key={i} className={`log-entry ${e.event}`}>
                <span className="log-round">R{e.round} {e.phase==='night'?'🌙':'☀️'}</span>
                <span className="log-text">{e.text}</span>
              </div>
            ))}
          </div>
        )}

        {tab==='stats' && (
          <div className="stats-panel">
            <h3 className="section-title">Your Stats</h3>
            {!myStats?<p className="stats-empty">Loading...</p>:(
              <>
                <div className="stats-grid">
                  <div className="stat-box"><span className="stat-num">{myStats.gamesPlayed}</span><span className="stat-label">Games</span></div>
                  <div className="stat-box win"><span className="stat-num">{myStats.wins}</span><span className="stat-label">Wins</span></div>
                  <div className="stat-box loss"><span className="stat-num">{myStats.losses}</span><span className="stat-label">Losses</span></div>
                  <div className="stat-box"><span className="stat-num">{myStats.gamesPlayed>0?Math.round((myStats.wins/myStats.gamesPlayed)*100):0}%</span><span className="stat-label">Win Rate</span></div>
                </div>
                {myStats.roleHistory?.length>0&&(
                  <div className="role-history">
                    <p className="section-title" style={{marginTop:16}}>Role History</p>
                    <div className="role-chips">
                      {[...new Set(myStats.roleHistory)].map(r=>{
                        const count = myStats.roleHistory.filter(x=>x===r).length;
                        return <span key={r} className="role-chip" style={{color:ROLE_COLORS[r],borderColor:ROLE_COLORS[r]+'55',background:ROLE_COLORS[r]+'18'}}>{ROLE_EMOJIS[r]} {r} ×{count}</span>;
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {tab==='board' && (
          <div className="leaderboard">
            <h3 className="section-title">🏆 Leaderboard</h3>
            {leaderboard.length===0?<p className="stats-empty">Play more games to see stats!</p>:(
              leaderboard.map((p,i)=>(
                <div key={p.id} className={`lb-row ${i===0?'first':i===1?'second':i===2?'third':''}`}>
                  <span className="lb-rank">#{i+1}</span>
                  <span className="lb-avatar">{p.avatar||'🎭'}</span>
                  <span className="lb-name">{p.name}</span>
                  <span className="lb-wins">{p.stats.wins}W / {p.stats.losses}L</span>
                  <span className="lb-rate">{Math.round((p.stats.wins/p.stats.gamesPlayed)*100)}%</span>
                </div>
              ))
            )}
          </div>
        )}

        <div className="ended-actions">
          {isHost?<button className="btn btn-primary" onClick={actions.restartGame}>Play Again</button>
            :<p className="waiting-host">Waiting for host to restart...</p>}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState, useRef } from 'react'
import confetti from 'canvas-confetti'
import { useGame } from '../context/GameContext'
import { isMafia } from '../engine'
import { sounds } from '../utils/sounds'

const RC = { mafia:'#e53e3e', godfather:'#9b2335', doctor:'#48bb78', detective:'#4299e1', sheriff:'#ecc94b', jester:'#ed64a6', bomber:'#f6ad55', witch:'#9f7aea', mayor:'#f6e05e', bodyguard:'#68d391', civilian:'#c9a84c' }
const RE = { mafia:'🔫', godfather:'🎩', doctor:'💉', detective:'🔍', sheriff:'⭐', jester:'🤡', bomber:'💣', witch:'🧙', mayor:'🏛️', bodyguard:'🛡️', civilian:'🏘️' }

function loadStats(name) { try { return JSON.parse(localStorage.getItem('mf_stats')||'{}')[name]||null } catch { return null } }
function saveStats(name, role, won) {
  try {
    const all = JSON.parse(localStorage.getItem('mf_stats')||'{}')
    const c = all[name]||{ wins:0, losses:0, games:0, roles:[] }
    c.games++; c.roles=[...(c.roles||[]), role]
    won ? c.wins++ : c.losses++
    all[name]=c; localStorage.setItem('mf_stats', JSON.stringify(all)); return c
  } catch { return null }
}

export default function EndedScreen() {
  const { state, actions } = useGame()
  const { players, playerId, playerName, myRole, winner, jesterWinner, gameLog, eliminatedPlayers, lastWills, mvpVotes, mvpResult } = state
  const [tab, setTab] = useState('results')
  const [stats, setStats] = useState(null)
  const [mvpVoted, setMvpVoted] = useState(false)
  const done = useRef(false)

  const isHost = playerId === state.hostId
  const iWon = (winner==='mafia'&&isMafia(myRole)) || (winner==='civilians'&&!isMafia(myRole)&&myRole!=='jester') || (winner==='jester'&&myRole==='jester')

  useEffect(() => {
    if (done.current) return; done.current = true
    const s = saveStats(playerName, myRole, iWon)
    setStats(s)
    if (iWon) {
      sounds.win()
      setTimeout(() => confetti({ particleCount:150, spread:80, origin:{y:0.6}, colors:['#c9a84c','#e8c97a','#fff','#f6ad55'] }), 300)
    } else { sounds.lose() }
  }, [])

  const wLabel = winner==='mafia'?'MAFIA WINS':winner==='jester'?'JESTER WINS':'TOWN WINS'
  const wIcon = winner==='mafia'?'🔫':winner==='jester'?'🤡':'⚖️'
  const wSub = winner==='mafia'?'The criminals took over the town.':winner==='jester'?`${jesterWinner} fooled everyone into voting them out!`:'Justice prevails. The Mafia has been defeated.'

  const lb = (players||[]).map(p=>({ ...p, s:loadStats(p.name) })).filter(p=>p.s).sort((a,b)=>b.s.wins-a.s.wins)

  return (
    <div className="screen ended-screen">
      <div className={`ended-bg bg-${winner}`}/>
      <div className="ended-content">

        <div className="winner-block">
          <div className="w-icon">{wIcon}</div>
          <h1 className="w-title">{wLabel}</h1>
          <p className="w-sub">{wSub}</p>
          <div className={`outcome ${iWon?'won':'lost'}`}>{iWon?'🏆 You Won!':'💀 You Lost'}</div>
        </div>

        {mvpResult && (
          <div className="mvp-banner">
            <span>👑</span>
            <span>MVP: <b>{mvpResult.avatar} {mvpResult.name}</b></span>
            <span className="mvp-v">{mvpResult.votes} votes</span>
          </div>
        )}

        <div className="end-tabs">
          {['results','mvp','log','stats','board'].map(t=>(
            <button key={t} className={`etab ${tab===t?'active':''}`} onClick={()=>setTab(t)}>
              {t==='board'?'🏆':t==='mvp'?'👑 MVP':t.charAt(0).toUpperCase()+t.slice(1)}
            </button>
          ))}
        </div>

        {tab==='results' && <>
          <div className="section">
            <div className="section-title">Roles Revealed</div>
            <div className="reveal-grid">
              {(players||[]).map(p=>(
                <div key={p.id} className={`rev-row ${p.alive?'':'dead'}`}>
                  <span className="r-av">{p.avatar||'🎭'}</span>
                  <span className="r-name">{p.name}{p.id===playerId?' (You)':''}</span>
                  <span className="r-role" style={{color:RC[p.role]||'#c9a84c',background:(RC[p.role]||'#c9a84c')+'22'}}>
                    {RE[p.role]} {p.role?.toUpperCase()}
                  </span>
                  {!p.alive && <span className="r-dead">☠</span>}
                </div>
              ))}
            </div>
          </div>

          {Object.entries(lastWills||{}).some(([,t])=>t) && (
            <div className="section">
              <div className="section-title">Last Wills</div>
              {Object.entries(lastWills||{}).filter(([,t])=>t).map(([id,text])=>{
                const p=(players||[]).find(x=>x.id===id)
                return p?(<div key={id} className="will-reveal"><span>📜</span><div><p className="will-name">{p.avatar} {p.name}:</p><p className="will-text">"{text}"</p></div></div>):null
              })}
            </div>
          )}

          {(eliminatedPlayers||[]).length>0 && (
            <div className="section">
              <div className="section-title">Elimination Log</div>
              {eliminatedPlayers.map((p,i)=>(
                <div key={i} className="elim-row">
                  <span>{p.reason==='night_kill'?'🌙':p.reason==='bomber'?'💣':p.reason==='voted'?'☀️':'⭐'}</span>
                  <span className="elim-rd">R{p.round}</span>
                  <span className="elim-name">{p.name}</span>
                  <span className="elim-role" style={{color:RC[p.role]||'#aaa'}}>{p.role}</span>
                </div>
              ))}
            </div>
          )}
        </>}

        {tab==='mvp' && (
          <div className="section">
            <div className="section-title">Vote for MVP</div>
            {mvpResult ? (
              <div className="mvp-big">
                <div className="mvp-av-big">{mvpResult.avatar}</div>
                <p className="mvp-name">{mvpResult.name}</p>
                <p className="mvp-sub">Most Valuable Player</p>
              </div>
            ) : <>
              <p className="mvp-hint">Who played the best this game?</p>
              <div className="mvp-grid">
                {(players||[]).filter(p=>p.id!==playerId).map(p=>(
                  <button key={p.id} className={`mvp-btn ${mvpVotes[playerId]===p.id?'sel':''} ${mvpVoted?'done':''}`}
                    onClick={()=>{ if(mvpVoted) return; setMvpVoted(true); actions.castMvpVote(p.id) }} disabled={mvpVoted}>
                    <span className="mvp-av">{p.avatar||'🎭'}</span>
                    <span className="mvp-n">{p.name}</span>
                    <span>{RE[p.role]}</span>
                    <span className="mvp-vc">{Object.values(mvpVotes||{}).filter(v=>v===p.id).length} votes</span>
                  </button>
                ))}
              </div>
              {mvpVoted && <p className="mvp-wait">Waiting for others...</p>}
            </>}
          </div>
        )}

        {tab==='log' && (
          <div className="section">
            <div className="section-title">Full Game Log</div>
            {!(gameLog?.length) && <p className="empty-msg">No events recorded.</p>}
            {(gameLog||[]).map((e,i)=>(
              <div key={i} className={`log-row ${e.event}`}>
                <span className="log-rd">R{e.round}{e.phase==='night'?' 🌙':' ☀️'}</span>
                <span>{e.text}</span>
              </div>
            ))}
          </div>
        )}

        {tab==='stats' && (
          <div className="section">
            <div className="section-title">Your Stats</div>
            {!stats ? <p className="empty-msg">Loading...</p> : <>
              <div className="stats-grid">
                <div className="stat-box"><span className="stat-n">{stats.games}</span><span className="stat-l">Games</span></div>
                <div className="stat-box win"><span className="stat-n">{stats.wins}</span><span className="stat-l">Wins</span></div>
                <div className="stat-box loss"><span className="stat-n">{stats.losses}</span><span className="stat-l">Losses</span></div>
                <div className="stat-box"><span className="stat-n">{stats.games>0?Math.round((stats.wins/stats.games)*100):0}%</span><span className="stat-l">Win Rate</span></div>
              </div>
              {stats.roles?.length>0 && (
                <div className="role-hist">
                  <p className="section-title" style={{marginTop:16}}>Role History</p>
                  <div className="role-chips">
                    {[...new Set(stats.roles)].map(r=>{
                      const cnt=stats.roles.filter(x=>x===r).length
                      return <span key={r} className="role-chip" style={{color:RC[r],borderColor:RC[r]+'55',background:RC[r]+'18'}}>{RE[r]} {r} ×{cnt}</span>
                    })}
                  </div>
                </div>
              )}
            </>}
          </div>
        )}

        {tab==='board' && (
          <div className="section">
            <div className="section-title">🏆 Leaderboard</div>
            {!lb.length ? <p className="empty-msg">Play more to see stats!</p> : lb.map((p,i)=>(
              <div key={p.id} className={`lb-row ${i===0?'gold':i===1?'silver':i===2?'bronze':''}`}>
                <span className="lb-rank">#{i+1}</span>
                <span className="lb-av">{p.avatar||'🎭'}</span>
                <span className="lb-name">{p.name}</span>
                <span className="lb-rec">{p.s.wins}W/{p.s.losses}L</span>
                <span className="lb-pct">{Math.round((p.s.wins/p.s.games)*100)}%</span>
              </div>
            ))}
          </div>
        )}

        <div className="end-actions">
          {isHost
            ? <button className="btn-primary" onClick={actions.restartGame}>Play Again</button>
            : <p className="waiting-host">Waiting for host to restart...</p>
          }
        </div>
      </div>
    </div>
  )
}

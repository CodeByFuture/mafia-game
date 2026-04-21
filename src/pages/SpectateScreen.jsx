import { useGame } from '../context/GameContext';

const ROLE_COLORS = {
  mafia:'#e53e3e', godfather:'#9b2335', doctor:'#48bb78', detective:'#4299e1',
  sheriff:'#ecc94b', jester:'#ed64a6', bomber:'#f6ad55', witch:'#9f7aea',
  mayor:'#f6e05e', bodyguard:'#68d391', civilian:'#c9a84c'
};
const ROLE_EMOJIS = {
  mafia:'🔫', godfather:'🎩', doctor:'💉', detective:'🔍', sheriff:'⭐',
  jester:'🤡', bomber:'💣', witch:'🧙', mayor:'🏛️', bodyguard:'🛡️', civilian:'🏘️'
};

export default function SpectateScreen() {
  const { state } = useGame();
  const { players, phase, round, nightLog, votes, eliminatedPlayers, gameLog, settings } = state;

  const alivePlayers = (players || []).filter(p => p.alive);
  const deadPlayers = (players || []).filter(p => !p.alive);

  const nightSummary = () => {
    if (!nightLog?.length) return null;
    const e = nightLog[0];
    if (e.type === 'killed') return `☠️ ${e.name} was killed`;
    if (e.type === 'saved') return `✨ Someone was saved`;
    if (e.type === 'peaceful') return `🌅 Peaceful night`;
    if (e.type === 'sheriff_hit') return `⭐ Sheriff shot ${e.name}`;
    if (e.type === 'bomber') return `💣 ${e.bomberName} exploded`;
    return null;
  };

  const voteCount = (id) => Object.values(votes || {}).filter(v => v === id).length;

  return (
    <div className="screen spectate-screen">
      <div className="spectate-bg" />
      <div className="spectate-content">
        <div className="spectate-header">
          <span className="spec-eye">👁️</span>
          <div>
            <h2 className="spec-title">Spectating</h2>
            <p className="spec-phase">{phase === 'night' ? `🌙 Night ${round}` : phase === 'day' ? `☀️ Day ${round}` : 'Lobby'}</p>
          </div>
        </div>

        {nightSummary() && (
          <div className="spec-night-report">{nightSummary()}</div>
        )}

        {/* All players with roles visible */}
        <div className="spec-section">
          <h3 className="section-title">Players ({alivePlayers.length} alive)</h3>
          <div className="spec-players">
            {(players || []).map(p => (
              <div key={p.id} className={`spec-player ${p.alive ? '' : 'dead'}`}>
                <span className="spec-avatar">{p.avatar || '🎭'}</span>
                <span className="spec-name">{p.name}</span>
                {p.role && (
                  <span className="spec-role" style={{ color: ROLE_COLORS[p.role], background: ROLE_COLORS[p.role] + '18' }}>
                    {ROLE_EMOJIS[p.role]} {p.role}
                  </span>
                )}
                {!p.alive && <span className="spec-dead">☠️</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Live vote tally during day */}
        {phase === 'day' && Object.keys(votes || {}).length > 0 && (
          <div className="spec-section">
            <h3 className="section-title">Live Votes</h3>
            <div className="spec-votes">
              {alivePlayers.map(p => {
                const count = voteCount(p.id);
                if (count === 0) return null;
                const pct = (count / alivePlayers.length) * 100;
                return (
                  <div key={p.id} className="spec-vote-row">
                    <span className="spec-vote-avatar">{p.avatar || '🎭'}</span>
                    <span className="spec-vote-name">{p.name}</span>
                    <div className="spec-vote-bar-wrap">
                      <div className="spec-vote-bar" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="spec-vote-count">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent game log */}
        {(gameLog || []).length > 0 && (
          <div className="spec-section">
            <h3 className="section-title">Recent Events</h3>
            <div className="spec-log">
              {[...gameLog].reverse().slice(0, 8).map((e, i) => (
                <div key={i} className="spec-log-entry">
                  <span>{e.phase === 'night' ? '🌙' : '☀️'}</span>
                  <span>{e.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

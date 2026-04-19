const MAFIA_ROLES = ['mafia', 'godfather'];
export const isMafiaRole = (r) => MAFIA_ROLES.includes(r);

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function assignRoles(players, settings) {
  const count = players.length;
  const s = settings;
  const roles = [];
  for (let i = 0; i < s.mafiaCount; i++)
    roles.push(s.hasGodfather && i === 0 ? 'godfather' : 'mafia');
  if (s.hasDoctor && count >= 4) roles.push('doctor');
  if (s.hasDetective && count >= 5) roles.push('detective');
  if (s.hasSheriff && count >= 6) roles.push('sheriff');
  if (s.hasBodyguard && count >= 6) roles.push('bodyguard');
  if (s.hasMayor && count >= 6) roles.push('mayor');
  if (s.hasJester && count >= 5) {
    const jCount = Math.min(s.jesterCount || 1, Math.floor(count / 5));
    for (let i = 0; i < jCount; i++) roles.push('jester');
  }
  if (s.hasBomber && count >= 6) roles.push('bomber');
  if (s.hasWitch && count >= 7) roles.push('witch');
  while (roles.length < count) roles.push('civilian');
  const shuffled = shuffle(roles);
  return players.map((p, i) => ({
    ...p, role: shuffled[i], alive: true,
    sheriffShotUsed: false, witchBlockUsed: false,
    mayorRevealed: false,
  }));
}

export function checkWinCondition(players) {
  const alive = players.filter(p => p.alive);
  const aliveMafia = alive.filter(p => isMafiaRole(p.role));
  const aliveNonMafia = alive.filter(p => !isMafiaRole(p.role));
  if (aliveMafia.length === 0) return 'civilians';
  if (aliveMafia.length >= aliveNonMafia.length) return 'mafia';
  return null;
}

export function resolveNight(players, nightActions, round) {
  const a = nightActions;
  const nightLog = [];
  const gameLogEntries = [];
  let updatedPlayers = players.map(p => ({ ...p }));
  const toKill = new Set();

  const witchBlock = a['witch_block'];
  const mafiaKill = a['mafia'];
  const doctorSave = a['doctor'];
  const bodyguardProtect = a['bodyguard'];

  if (mafiaKill && mafiaKill !== witchBlock) {
    const target = updatedPlayers.find(p => p.id === mafiaKill);
    if (target?.alive) {
      if (doctorSave === mafiaKill || bodyguardProtect === mafiaKill) {
        nightLog.push({ type: 'saved', name: target.name });
        gameLogEntries.push({ event: 'saved', text: `${target.name} was saved`, round, phase: 'night' });
        // Bodyguard dies protecting
        if (bodyguardProtect === mafiaKill) {
          const bg = updatedPlayers.find(p => p.role === 'bodyguard');
          if (bg?.alive) {
            bg.alive = false;
            nightLog.push({ type: 'bodyguard_died', name: bg.name });
            gameLogEntries.push({ event: 'bodyguard_died', text: `${bg.name} (Bodyguard) died protecting ${target.name}`, round, phase: 'night' });
          }
        }
      } else {
        toKill.add(mafiaKill);
        nightLog.push({ type: 'killed', name: target.name });
        gameLogEntries.push({ event: 'killed', text: `${target.name} was killed by the Mafia`, round, phase: 'night' });
      }
    }
  } else if (!mafiaKill) {
    nightLog.push({ type: 'peaceful' });
    gameLogEntries.push({ event: 'peaceful', text: 'A peaceful night', round, phase: 'night' });
  } else if (witchBlock && mafiaKill === witchBlock) {
    nightLog.push({ type: 'witch_blocked' });
    gameLogEntries.push({ event: 'witch_blocked', text: 'Witch blocked the Mafia kill', round, phase: 'night' });
  }

  const sheriffShot = a['sheriff'];
  if (sheriffShot && sheriffShot !== witchBlock) {
    const target = updatedPlayers.find(p => p.id === sheriffShot);
    const shooter = updatedPlayers.find(p => p.role === 'sheriff');
    if (shooter && target?.alive) {
      if (isMafiaRole(target.role)) {
        toKill.add(sheriffShot);
        nightLog.push({ type: 'sheriff_hit', name: target.name });
        gameLogEntries.push({ event: 'sheriff_hit', text: `Sheriff shot ${target.name} (Mafia)`, round, phase: 'night' });
      } else {
        toKill.add(sheriffShot); toKill.add(shooter.id);
        nightLog.push({ type: 'sheriff_miss', name: target.name });
        gameLogEntries.push({ event: 'sheriff_miss', text: `Sheriff shot ${target.name} (innocent) — both die`, round, phase: 'night' });
      }
    }
  }

  const eliminated = [];
  for (const id of toKill) {
    const p = updatedPlayers.find(x => x.id === id);
    if (p?.alive) {
      p.alive = false;
      if (p.role === 'bomber') {
        const alive = updatedPlayers.filter(b => b.alive && b.id !== p.id);
        if (alive.length > 0) {
          const victim = alive[Math.floor(Math.random() * alive.length)];
          victim.alive = false;
          nightLog.push({ type: 'bomber', bomberName: p.name, victimName: victim.name });
          gameLogEntries.push({ event: 'bomber', text: `${p.name} exploded, taking ${victim.name}`, round, phase: 'night' });
          eliminated.push({ id: victim.id, name: victim.name, role: victim.role, reason: 'bomber', round });
        }
      }
      eliminated.push({ id: p.id, name: p.name, role: p.role, reason: 'night_kill', round });
    }
  }

  return { players: updatedPlayers, nightLog, eliminated, gameLogEntries };
}

export function resolveVotes(players, votes, round) {
  // Mayor's vote counts double
  const tally = {};
  for (const [voterId, targetId] of Object.entries(votes)) {
    if (targetId === 'skip') continue;
    const voter = players.find(p => p.id === voterId);
    const weight = (voter?.role === 'mayor' && voter?.mayorRevealed) ? 2 : 1;
    tally[targetId] = (tally[targetId] || 0) + weight;
  }

  let maxVotes = 0, eliminated = null;
  for (const [id, count] of Object.entries(tally))
    if (count > maxVotes) { maxVotes = count; eliminated = id; }

  const topCount = Object.values(tally).filter(c => c === maxVotes).length;
  if (topCount > 1) eliminated = null;

  let updatedPlayers = players.map(p => ({ ...p }));
  const eliminatedList = [];
  const gameLogEntries = [];

  if (eliminated) {
    const target = updatedPlayers.find(p => p.id === eliminated);
    if (target) {
      target.alive = false;
      eliminatedList.push({ id: target.id, name: target.name, role: target.role, reason: 'voted', round });
      gameLogEntries.push({ event: 'voted_out', text: `${target.name} (${target.role}) voted out`, round, phase: 'day' });
      if (target.role === 'bomber') {
        const alive = updatedPlayers.filter(p => p.alive);
        if (alive.length > 0) {
          const victim = alive[Math.floor(Math.random() * alive.length)];
          victim.alive = false;
          eliminatedList.push({ id: victim.id, name: victim.name, role: victim.role, reason: 'bomber', round });
          gameLogEntries.push({ event: 'bomber', text: `${target.name} exploded, killing ${victim.name}`, round, phase: 'day' });
        }
      }
    }
  } else {
    gameLogEntries.push({ event: 'vote_skip', text: 'No elimination (tie/skip)', round, phase: 'day' });
  }

  if (eliminated) {
    const target = updatedPlayers.find(p => p.id === eliminated);
    if (target?.role === 'jester')
      return { players: updatedPlayers, eliminated: eliminatedList, gameLogEntries, jesterWin: target.name };
  }

  return { players: updatedPlayers, eliminated: eliminatedList, gameLogEntries, jesterWin: null };
}

export function checkNightComplete(players, nightActions) {
  for (const player of players.filter(p => p.alive)) {
    const role = player.role;
    let key;
    if (role === 'mafia' || role === 'godfather') key = 'mafia';
    else if (role === 'doctor') key = 'doctor';
    else if (role === 'detective') key = 'detective';
    else if (role === 'sheriff') key = player.sheriffShotUsed ? `skip_${player.id}` : 'sheriff';
    else if (role === 'bodyguard') key = 'bodyguard';
    else if (role === 'witch') key = `skip_${player.id}`;
    else key = `skip_${player.id}`;
    if (!nightActions[key]) return false;
  }
  return true;
}

export function checkVotesComplete(players, votes) {
  return players.filter(p => p.alive).every(p => votes[p.id] !== undefined);
}

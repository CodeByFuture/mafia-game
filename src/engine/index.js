export const MAFIA_ROLES = ['mafia', 'godfather']
export const isMafia = r => MAFIA_ROLES.includes(r)

export function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function assignRoles(players, s) {
  const count = players.length
  const roles = []
  for (let i = 0; i < s.mafiaCount; i++)
    roles.push(s.hasGodfather && i === 0 ? 'godfather' : 'mafia')
  if (s.hasDoctor && count >= 4) roles.push('doctor')
  if (s.hasDetective && count >= 5) roles.push('detective')
  if (s.hasSheriff && count >= 6) roles.push('sheriff')
  if (s.hasBodyguard && count >= 6) roles.push('bodyguard')
  if (s.hasMayor && count >= 6) roles.push('mayor')
  if (s.hasJester && count >= 5) {
    const n = Math.min(s.jesterCount || 1, Math.floor(count / 5))
    for (let i = 0; i < n; i++) roles.push('jester')
  }
  if (s.hasBomber && count >= 6) roles.push('bomber')
  if (s.hasWitch && count >= 7) roles.push('witch')
  while (roles.length < count) roles.push('civilian')
  const shuffled = shuffle(roles)
  return players.map((p, i) => ({ ...p, role: shuffled[i], alive: true, sheriffShotUsed: false, witchBlockUsed: false }))
}

export function checkWin(players) {
  const alive = players.filter(p => p.alive)
  const mafiaAlive = alive.filter(p => isMafia(p.role))
  const othersAlive = alive.filter(p => !isMafia(p.role))
  if (mafiaAlive.length === 0) return 'civilians'
  if (mafiaAlive.length >= othersAlive.length) return 'mafia'
  return null
}

export function resolveNight(players, actions, round) {
  let updated = players.map(p => ({ ...p }))
  const log = [], eliminated = [], gameLog = []
  const toKill = new Set()
  const { mafia: mafiaKill, doctor: doctorSave, bodyguard: bgProtect, witch_block: witchBlock, sheriff: sheriffShot } = actions

  // Mafia kill
  if (mafiaKill && mafiaKill !== witchBlock) {
    const t = updated.find(p => p.id === mafiaKill)
    if (t?.alive) {
      if (doctorSave === mafiaKill || bgProtect === mafiaKill) {
        log.push({ type: 'saved', name: t.name })
        gameLog.push({ event: 'saved', text: `${t.name} was saved`, round, phase: 'night' })
        if (bgProtect === mafiaKill) {
          const bg = updated.find(p => p.role === 'bodyguard' && p.alive)
          if (bg) { bg.alive = false; log.push({ type: 'bodyguard_died', name: bg.name }); gameLog.push({ event: 'bodyguard_died', text: `${bg.name} (Bodyguard) died protecting ${t.name}`, round, phase: 'night' }); eliminated.push({ id: bg.id, name: bg.name, role: bg.role, reason: 'bodyguard', round }) }
        }
      } else { toKill.add(mafiaKill); log.push({ type: 'killed', name: t.name }); gameLog.push({ event: 'killed', text: `${t.name} was killed by Mafia`, round, phase: 'night' }) }
    }
  } else if (!mafiaKill) {
    log.push({ type: 'peaceful' }); gameLog.push({ event: 'peaceful', text: 'A peaceful night', round, phase: 'night' })
  } else {
    log.push({ type: 'witch_blocked' }); gameLog.push({ event: 'witch_blocked', text: 'Witch blocked the Mafia kill', round, phase: 'night' })
  }

  // Sheriff
  if (sheriffShot && sheriffShot !== witchBlock) {
    const t = updated.find(p => p.id === sheriffShot)
    const shooter = updated.find(p => p.role === 'sheriff' && p.alive)
    if (t?.alive && shooter) {
      if (isMafia(t.role)) { toKill.add(sheriffShot); log.push({ type: 'sheriff_hit', name: t.name }); gameLog.push({ event: 'sheriff_hit', text: `Sheriff shot ${t.name} (Mafia!)`, round, phase: 'night' }) }
      else { toKill.add(sheriffShot); toKill.add(shooter.id); log.push({ type: 'sheriff_miss', name: t.name }); gameLog.push({ event: 'sheriff_miss', text: `Sheriff missed — both died`, round, phase: 'night' }) }
    }
  }

  for (const id of toKill) {
    const p = updated.find(x => x.id === id)
    if (p?.alive) {
      p.alive = false
      if (p.role === 'bomber') {
        const bystanders = updated.filter(b => b.alive && b.id !== p.id)
        if (bystanders.length) { const v = bystanders[Math.floor(Math.random() * bystanders.length)]; v.alive = false; log.push({ type: 'bomber', bomberName: p.name, victimName: v.name }); gameLog.push({ event: 'bomber', text: `${p.name} exploded, taking ${v.name}`, round, phase: 'night' }); eliminated.push({ id: v.id, name: v.name, role: v.role, reason: 'bomber', round }) }
      }
      eliminated.push({ id: p.id, name: p.name, role: p.role, reason: 'night_kill', round })
    }
  }
  return { players: updated, log, eliminated, gameLog }
}

export function resolveVotes(players, votes, round) {
  const tally = {}
  for (const [voterId, targetId] of Object.entries(votes)) {
    if (targetId === 'skip') continue
    const voter = players.find(p => p.id === voterId)
    const w = voter?.role === 'mayor' && voter?.mayorRevealed ? 2 : 1
    tally[targetId] = (tally[targetId] || 0) + w
  }
  let max = 0, eliminated = null
  for (const [id, c] of Object.entries(tally)) if (c > max) { max = c; eliminated = id }
  const topCount = Object.values(tally).filter(c => c === max).length
  if (topCount > 1) eliminated = null

  let updated = players.map(p => ({ ...p }))
  const eliminatedList = [], gameLog = []
  if (eliminated) {
    const t = updated.find(p => p.id === eliminated)
    if (t) {
      t.alive = false
      eliminatedList.push({ id: t.id, name: t.name, role: t.role, reason: 'voted', round })
      gameLog.push({ event: 'voted_out', text: `${t.name} (${t.role}) voted out`, round, phase: 'day' })
      if (t.role === 'bomber') {
        const alive = updated.filter(p => p.alive)
        if (alive.length) { const v = alive[Math.floor(Math.random() * alive.length)]; v.alive = false; eliminatedList.push({ id: v.id, name: v.name, role: v.role, reason: 'bomber', round }); gameLog.push({ event: 'bomber', text: `${t.name} exploded, killing ${v.name}`, round, phase: 'day' }) }
      }
    }
    if (updated.find(p => p.id === eliminated)?.role === 'jester')
      return { players: updated, eliminated: eliminatedList, gameLog, jesterWin: updated.find(p => p.id === eliminated)?.name }
  } else {
    gameLog.push({ event: 'vote_skip', text: 'No elimination (tie/skip)', round, phase: 'day' })
  }
  return { players: updated, eliminated: eliminatedList, gameLog, jesterWin: null }
}

export function nightComplete(players, actions) {
  for (const p of players.filter(x => x.alive)) {
    let key
    if (p.role === 'mafia' || p.role === 'godfather') key = 'mafia'
    else if (p.role === 'doctor') key = 'doctor'
    else if (p.role === 'detective') key = 'detective'
    else if (p.role === 'sheriff') key = p.sheriffShotUsed ? `skip_${p.id}` : 'sheriff'
    else if (p.role === 'bodyguard') key = 'bodyguard'
    else key = `skip_${p.id}`
    if (!actions[key]) return false
  }
  return true
}

export function votesComplete(players, votes) {
  return players.filter(p => p.alive).every(p => votes[p.id] !== undefined)
}

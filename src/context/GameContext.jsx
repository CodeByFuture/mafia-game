import { createContext, useContext, useReducer, useRef, useCallback } from 'react'
import { createRealtime, waitForConnection } from '../utils/realtime'
import {
  assignRoles, checkWin, resolveNight, resolveVotes,
  nightComplete, votesComplete, isMafia
} from '../engine'

const Ctx = createContext(null)

const DEF_SETTINGS = {
  mafiaCount: 1, hasDoctor: true, hasDetective: true,
  hasJester: false, jesterCount: 1, hasSheriff: false,
  hasGodfather: false, hasBomber: false, hasWitch: false,
  hasMayor: false, hasBodyguard: false,
  voteTimerSeconds: 0, password: '',
}

const INIT = {
  screen: 'home',
  playerId: null, playerName: null, playerAvatar: '🎭',
  myRole: null, mafiaTeam: [],
  roomCode: null, players: [], hostId: null,
  phase: 'lobby', round: 0, settings: DEF_SETTINGS,
  eliminatedPlayers: [], gameLog: [], nightLog: [],
  nightAction: null, detectiveResult: null, actionConfirmed: false,
  votes: {}, mafiaChat: [], deadChat: [],
  voteTimerSeconds: 0, voteTimerActive: false,
  winner: null, jesterWinner: null,
  mvpVotes: {}, mvpResult: null, lastWills: {}, myLastWill: '',
  rolesInGame: [], error: null,
  transitioning: false, transitionType: null,
}

function reduce(state, action) {
  switch (action.type) {
    case 'RESET': return { ...INIT }
    case 'PATCH': return { ...state, ...action.p }
    case 'ERR': return { ...state, error: action.msg }
    case 'CLEAR_ERR': return { ...state, error: null }
    case 'MAFIA_MSG': return { ...state, mafiaChat: [...state.mafiaChat, action.msg] }
    case 'DEAD_MSG': return { ...state, deadChat: [...state.deadChat, action.msg] }
    default: return state
  }
}

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(reduce, INIT)
  const S = useRef(state)
  S.current = state

  // Per-instance refs — NEVER module-level variables
  const ablyRef = useRef(null)
  const channelRef = useRef(null)
  const myIdRef = useRef(null)
  const isHostRef = useRef(false)
  const nightActionsRef = useRef({})
  const votesRef = useRef({})
  const voteTimerRef = useRef(null)
  const willsRef = useRef({})

  const p = useCallback(msg => channelRef.current?.publish('g', msg), [])

  const pp = useCallback((toId, msg) => {
    ablyRef.current?.channels
      .get(`mp-${S.current.roomCode}-${toId}`)
      .publish('p', msg)
  }, [])

  const fade = useCallback((screen, type, payload) => {
    dispatch({ type: 'PATCH', p: { transitioning: true, transitionType: type } })
    setTimeout(() => dispatch({ type: 'PATCH', p: { ...payload, screen, transitioning: false, transitionType: null } }), 600)
  }, [])

  // ── Connect ──────────────────────────────────────────────────
  async function connect(roomCode, playerId) {
    const key = import.meta.env.VITE_ABLY_KEY
    if (!key) { dispatch({ type: 'ERR', msg: 'Missing Ably key in .env' }); return }

    // FRESH instance — stored in ref, never in module scope
    const ably = createRealtime(key, playerId)
    ablyRef.current = ably
    myIdRef.current = playerId

    try {
      await waitForConnection(ably)
    } catch (e) {
      dispatch({ type: 'ERR', msg: 'Could not connect to Ably. Check your internet.' })
      return
    }

    // Public room channel
    const ch = ably.channels.get(`mr-${roomCode}`)
    channelRef.current = ch
    ch.subscribe('g', msg => onPublic(msg.data))

    // My private channel
    ably.channels.get(`mp-${roomCode}-${playerId}`)
      .subscribe('p', msg => onPrivate(msg.data))
  }

  // ── Public message handler ────────────────────────────────────
  function onPublic(data) {
    const s = S.current
    const myId = myIdRef.current

    switch (data.t) {
      // ── Lobby ────────────────────────────────────────────────
      case 'JOIN': {
        // Password check (host enforces)
        if (isHostRef.current && s.settings.password && data.pw !== s.settings.password && data.player.id !== myId) {
          p({ t: 'KICK', id: data.player.id, reason: 'Wrong password.' }); return
        }
        if (s.players.find(x => x.id === data.player.id)) break
        const newPlayers = [...s.players, data.player]
        dispatch({ type: 'PATCH', p: { players: newPlayers } })
        // Host broadcasts full list so everyone syncs
        if (isHostRef.current) {
          setTimeout(() => p({ t: 'SYNC', players: S.current.players, hostId: myId, settings: S.current.settings }), 100)
        }
        break
      }
      case 'SYNC':
        dispatch({ type: 'PATCH', p: { players: data.players, hostId: data.hostId, settings: data.settings } })
        break
      case 'GET_SYNC':
        if (isHostRef.current) p({ t: 'SYNC', players: s.players, hostId: myId, settings: s.settings })
        break
      case 'KICK':
        if (data.id === myId) { dispatch({ type: 'RESET' }); dispatch({ type: 'ERR', msg: data.reason || 'You were kicked.' }) }
        else dispatch({ type: 'PATCH', p: { players: s.players.filter(x => x.id !== data.id) } })
        break
      case 'SETTINGS':
        dispatch({ type: 'PATCH', p: { settings: data.settings } })
        break

      // ── Game ─────────────────────────────────────────────────
      case 'START':
        dispatch({ type: 'PATCH', p: { rolesInGame: data.rolesInGame } })
        break
      case 'NIGHT':
        fade(s.phase === 'lobby' || s.phase === 'day' ? 'night' : 'night', 'to_night', {
          phase: 'night', round: data.round,
          actionConfirmed: false, detectiveResult: null,
          nightLog: [], votes: {}, nightAction: null,
        })
        break
      case 'DAY':
        fade('day', 'to_day', {
          phase: 'day', nightLog: data.nightLog,
          players: data.players, eliminatedPlayers: data.eliminatedPlayers,
          gameLog: data.gameLog, votes: {},
          voteTimerActive: data.vt > 0, voteTimerSeconds: data.vt,
          lastWills: { ...s.lastWills, ...data.wills },
        })
        break
      case 'VOTES':
        dispatch({ type: 'PATCH', p: { votes: data.votes } })
        break
      case 'OUT':
        dispatch({ type: 'PATCH', p: {
          players: s.players.map(x => x.id === data.id ? { ...x, alive: false } : x),
          eliminatedPlayers: data.elim,
          lastWills: data.will ? { ...s.lastWills, [data.id]: data.will } : s.lastWills,
        }})
        break
      case 'END':
        dispatch({ type: 'PATCH', p: {
          screen: 'ended', phase: 'ended',
          winner: data.winner, jesterWinner: data.jw,
          players: data.players, gameLog: data.gameLog,
          eliminatedPlayers: data.elim,
        }})
        break
      case 'MVP_V':
        dispatch({ type: 'PATCH', p: { mvpVotes: data.v } })
        break
      case 'MVP_R':
        dispatch({ type: 'PATCH', p: { mvpResult: data.r } })
        break
      case 'RESTART':
        dispatch({ type: 'PATCH', p: {
          screen: 'lobby', phase: 'lobby', round: 0,
          players: data.players, settings: data.settings, hostId: data.hostId,
          eliminatedPlayers: [], gameLog: [], nightLog: [],
          mafiaChat: [], deadChat: [], winner: null, jesterWinner: null,
          myRole: null, mafiaTeam: [], nightAction: null,
          actionConfirmed: false, detectiveResult: null,
          mvpVotes: {}, mvpResult: null, lastWills: {}, myLastWill: '',
          rolesInGame: [],
        }})
        break
      case 'MCHAT':
        if (isMafia(s.myRole)) dispatch({ type: 'MAFIA_MSG', msg: data })
        break
      case 'DCHAT': {
        const me = s.players.find(x => x.id === myId)
        if (me && !me.alive) dispatch({ type: 'DEAD_MSG', msg: data })
        break
      }
      case 'WILL':
        willsRef.current[data.id] = data.text
        break

      // ── Host engine ──────────────────────────────────────────
      case 'NA':
        if (isHostRef.current) hostNightAction(data.actions, data.round)
        break
      case 'VT':
        if (isHostRef.current) hostVote(data.votes, data.round)
        break
    }
  }

  // ── Private message handler ───────────────────────────────────
  function onPrivate(data) {
    switch (data.t) {
      case 'ROLE':
        dispatch({ type: 'PATCH', p: { myRole: data.role, mafiaTeam: data.team || [], screen: 'role_reveal' } })
        break
      case 'NIGHT_PROMPT':
        dispatch({ type: 'PATCH', p: {
          nightAction: { role: data.role, targets: data.targets, blockUsed: data.blockUsed },
          actionConfirmed: false, detectiveResult: null,
        }})
        break
      case 'DET':
        dispatch({ type: 'PATCH', p: { detectiveResult: { targetName: data.name, isMafia: data.isMafia } } })
        break
    }
  }

  // ── HOST: night actions ───────────────────────────────────────
  function hostNightAction(incoming, round) {
    const s = S.current
    if (s.round !== round) return
    nightActionsRef.current = { ...nightActionsRef.current, ...incoming }
    if (nightComplete(s.players, nightActionsRef.current))
      setTimeout(() => hostResolveNight(round), 1500)
  }

  // ── HOST: votes ───────────────────────────────────────────────
  function hostVote(incoming, round) {
    const s = S.current
    if (s.round !== round) return
    votesRef.current = { ...votesRef.current, ...incoming }
    p({ t: 'VOTES', votes: votesRef.current })
    if (votesComplete(s.players, votesRef.current)) {
      if (voteTimerRef.current) { clearTimeout(voteTimerRef.current); voteTimerRef.current = null }
      setTimeout(() => hostResolveDay(round), 1500)
    }
  }

  // ── HOST: resolve night ───────────────────────────────────────
  function hostResolveNight(round) {
    const s = S.current
    const { players, log, eliminated, gameLog } = resolveNight(s.players, nightActionsRef.current, round)
    const newLog = [...s.gameLog, ...gameLog]
    const newElim = [...s.eliminatedPlayers, ...eliminated]
    nightActionsRef.current = {}
    const wills = {}
    for (const e of eliminated) {
      const w = willsRef.current[e.id]
      if (w) wills[e.id] = w
      p({ t: 'OUT', id: e.id, elim: newElim, will: w || null })
    }
    const winner = checkWin(players)
    if (winner) { p({ t: 'END', winner, jw: null, players, gameLog: newLog, elim: newElim }); return }
    votesRef.current = {}
    const vt = s.settings.voteTimerSeconds
    p({ t: 'DAY', nightLog: log, players, eliminatedPlayers: newElim, gameLog: newLog, round, vt, wills })
    if (vt > 0) voteTimerRef.current = setTimeout(() => hostResolveDay(round), vt * 1000)
  }

  // ── HOST: resolve day ─────────────────────────────────────────
  function hostResolveDay(round) {
    const s = S.current
    const { players, eliminated, gameLog, jesterWin } = resolveVotes(s.players, votesRef.current, round)
    const newLog = [...s.gameLog, ...gameLog]
    const newElim = [...s.eliminatedPlayers, ...eliminated]
    votesRef.current = {}
    for (const e of eliminated) p({ t: 'OUT', id: e.id, elim: newElim, will: willsRef.current[e.id] || null })
    if (jesterWin) { p({ t: 'END', winner: 'jester', jw: jesterWin, players, gameLog: newLog, elim: newElim }); return }
    const winner = checkWin(players)
    if (winner) { p({ t: 'END', winner, jw: null, players, gameLog: newLog, elim: newElim }); return }
    setTimeout(() => hostStartNight(round + 1, players, newLog, newElim), 2000)
  }

  // ── HOST: start night ─────────────────────────────────────────
  function hostStartNight(round, players, gameLog, elim) {
    nightActionsRef.current = {}
    p({ t: 'NIGHT', round })
    for (const player of players) {
      const alive = players.filter(x => x.alive)
      const tg = f => alive.filter(f).map(x => ({ id: x.id, name: x.name, avatar: x.avatar }))
      if (!player.alive) { pp(player.id, { t: 'NIGHT_PROMPT', role: 'dead', targets: [] }); continue }
      switch (player.role) {
        case 'mafia': case 'godfather': pp(player.id, { t: 'NIGHT_PROMPT', role: player.role, targets: tg(x => !isMafia(x.role)) }); break
        case 'doctor': pp(player.id, { t: 'NIGHT_PROMPT', role: 'doctor', targets: tg(() => true) }); break
        case 'detective': pp(player.id, { t: 'NIGHT_PROMPT', role: 'detective', targets: tg(x => x.id !== player.id) }); break
        case 'sheriff': pp(player.id, { t: 'NIGHT_PROMPT', role: player.sheriffShotUsed ? 'sheriff_used' : 'sheriff', targets: tg(x => x.id !== player.id) }); break
        case 'witch': pp(player.id, { t: 'NIGHT_PROMPT', role: 'witch', targets: tg(x => x.id !== player.id), blockUsed: player.witchBlockUsed }); break
        case 'bodyguard': pp(player.id, { t: 'NIGHT_PROMPT', role: 'bodyguard', targets: tg(x => x.id !== player.id) }); break
        default: pp(player.id, { t: 'NIGHT_PROMPT', role: player.role, targets: [] })
      }
    }
  }

  // ── Public actions ────────────────────────────────────────────
  const actions = {

    createRoom: async (name, avatar) => {
      const playerId = crypto.randomUUID()
      const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase()
      const player = { id: playerId, name, avatar, alive: true, role: null, isHost: true }
      isHostRef.current = true
      dispatch({ type: 'PATCH', p: {
        playerId, playerName: name, playerAvatar: avatar,
        roomCode, hostId: playerId, players: [player], screen: 'lobby',
      }})
      await connect(roomCode, playerId)
      // Now connected — announce self
      p({ t: 'JOIN', player, pw: '' })
    },

    joinRoom: async (name, avatar, roomCode, password) => {
      const playerId = crypto.randomUUID()
      const player = { id: playerId, name, avatar, alive: true, role: null, isHost: false }
      isHostRef.current = false
      dispatch({ type: 'PATCH', p: {
        playerId, playerName: name, playerAvatar: avatar,
        roomCode, players: [player], screen: 'lobby',
      }})
      await connect(roomCode, playerId)
      // Announce self then request full list from host
      p({ t: 'JOIN', player, pw: password || '' })
      setTimeout(() => p({ t: 'GET_SYNC' }), 500)
    },

    kickPlayer: id => {
      if (!isHostRef.current) return
      dispatch({ type: 'PATCH', p: { players: S.current.players.filter(x => x.id !== id) } })
      p({ t: 'KICK', id })
    },

    startGame: () => {
      if (!isHostRef.current) return
      const s = S.current
      const assigned = assignRoles(s.players, s.settings)
      const rolesInGame = [...new Set(assigned.map(x => x.role))]
      for (const player of assigned) {
        const team = isMafia(player.role)
          ? assigned.filter(x => isMafia(x.role) && x.id !== player.id).map(x => ({ id: x.id, name: x.name, role: x.role, avatar: x.avatar }))
          : []
        pp(player.id, { t: 'ROLE', role: player.role, team })
      }
      dispatch({ type: 'PATCH', p: { players: assigned, rolesInGame } })
      p({ t: 'START', rolesInGame })
      setTimeout(() => hostStartNight(1, assigned, [], []), 3000)
    },

    updateSettings: settings => {
      if (!isHostRef.current) return
      const n = { ...S.current.settings, ...settings }
      dispatch({ type: 'PATCH', p: { settings: n } })
      p({ t: 'SETTINGS', settings: n })
    },

    submitNightAction: (targetId, actionType) => {
      const s = S.current
      const myId = myIdRef.current
      const player = s.players.find(x => x.id === myId)
      let update = {}
      if (!player?.alive) { update[`skip_${myId}`] = 'done' }
      else {
        const role = player.role
        if (role === 'mafia' || role === 'godfather') update.mafia = targetId
        else if (role === 'doctor') update.doctor = targetId
        else if (role === 'detective') {
          update.detective = targetId
          const target = s.players.find(x => x.id === targetId)
          if (target) dispatch({ type: 'PATCH', p: { detectiveResult: { targetName: target.name, isMafia: target.role === 'mafia' } } })
        }
        else if (role === 'sheriff') update.sheriff = targetId
        else if (role === 'bodyguard') update.bodyguard = targetId
        else if (role === 'witch') { if (actionType === 'block') update.witch_block = targetId; update[`skip_${myId}`] = 'done' }
        else update[`skip_${myId}`] = 'done'
      }
      dispatch({ type: 'PATCH', p: { actionConfirmed: true } })
      p({ t: 'NA', actions: update, round: s.round })
    },

    castVote: targetId => p({ t: 'VT', votes: { [myIdRef.current]: targetId }, round: S.current.round }),

    castMvpVote: targetId => {
      const s = S.current
      const myId = myIdRef.current
      const nv = { ...s.mvpVotes, [myId]: targetId }
      dispatch({ type: 'PATCH', p: { mvpVotes: nv } })
      p({ t: 'MVP_V', v: nv })
      if (isHostRef.current) {
        const tally = {}
        for (const v of Object.values(nv)) tally[v] = (tally[v] || 0) + 1
        const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]
        const mvp = s.players.find(x => x.id === top?.[0])
        if (mvp) p({ t: 'MVP_R', r: { name: mvp.name, avatar: mvp.avatar, votes: top[1] } })
      }
    },

    saveLastWill: text => {
      dispatch({ type: 'PATCH', p: { myLastWill: text } })
      p({ t: 'WILL', id: myIdRef.current, text })
    },

    sendMafiaChat: text => {
      const s = S.current
      p({ t: 'MCHAT', sender: s.playerName, avatar: s.playerAvatar, text, time: Date.now() })
    },

    sendDeadChat: text => {
      const s = S.current
      p({ t: 'DCHAT', sender: s.playerName, avatar: s.playerAvatar, text, time: Date.now() })
    },

    restartGame: () => {
      if (!isHostRef.current) return
      willsRef.current = {}
      const s = S.current
      p({ t: 'RESTART', players: s.players.map(x => ({ ...x, role: null, alive: true })), settings: s.settings, hostId: myIdRef.current })
    },

    clearError: () => dispatch({ type: 'CLEAR_ERR' }),
  }

  return <Ctx.Provider value={{ state, actions }}>{children}</Ctx.Provider>
}

export const useGame = () => useContext(Ctx)

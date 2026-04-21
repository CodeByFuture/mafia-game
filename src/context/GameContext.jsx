import { createContext, useContext, useReducer, useCallback, useRef, useEffect } from 'react';
import * as Ably from 'ably';
import {
  assignRoles, checkWinCondition, resolveNight, resolveVotes,
  checkNightComplete, checkVotesComplete, isMafiaRole
} from '../engine';

const GameContext = createContext(null);

// ── Persist session to localStorage so reconnect works ──────────
const SESSION_KEY = 'mafia_session';
function saveSession(data) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(data)); } catch {}
}
function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}
function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch {}
}

const initialState = {
  screen: 'home',
  playerId: null,
  playerName: null,
  playerAvatar: '🎭',
  myRole: null,
  mafiaTeam: [],
  roomCode: null,
  players: [],
  spectators: [],
  phase: 'lobby',
  round: 0,
  settings: {
    mafiaCount: 1, hasDoctor: true, hasDetective: true,
    hasJester: false, jesterCount: 1, hasSheriff: false,
    hasGodfather: false, hasBomber: false, hasWitch: false,
    hasMayor: false, hasBodyguard: false,
    voteTimerSeconds: 0, password: '',
  },
  hostId: null,
  eliminatedPlayers: [],
  gameLog: [],
  nightLog: [],
  nightAction: null,
  detectiveResult: null,
  actionConfirmed: false,
  votes: {},
  mafiaChat: [],
  deadChat: [],
  voteTimerSeconds: 0,
  voteTimerActive: false,
  winner: null,
  jesterWinner: null,
  mvpVotes: {},
  mvpResult: null,
  lastWills: {},
  myLastWill: '',
  error: null,
  isSpectator: false,
  rolesInGame: [],
  transitioning: false, // for animations
  transitionType: null, // 'to_night' | 'to_day'
  reconnecting: false,
};

function reducer(state, action) {
  switch (action.type) {
    case 'RESET': return { ...initialState };
    case 'PATCH': return { ...state, ...action.payload };
    case 'SET_ERROR': return { ...state, error: action.error };
    case 'CLEAR_ERROR': return { ...state, error: null };
    case 'ADD_MAFIA_CHAT': return { ...state, mafiaChat: [...state.mafiaChat, action.msg] };
    case 'ADD_DEAD_CHAT': return { ...state, deadChat: [...state.deadChat, action.msg] };
    case 'SET_LAST_WILL': return { ...state, myLastWill: action.text };
    default: return state;
  }
}

let ablyClient = null;
function getClient() {
  if (!ablyClient) {
    const key = import.meta.env.VITE_ABLY_KEY;
    if (!key) return null;
    ablyClient = new Ably.Realtime({ key, clientId: crypto.randomUUID() });
  }
  return ablyClient;
}

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const channelRef = useRef(null);
  const nightActionsStore = useRef({});
  const votesStore = useRef({});
  const voteTimerRef = useRef(null);
  const lastWillsStore = useRef({});
  const gameStateSnapshot = useRef(null); // full snapshot for reconnect

  // ── Check for existing session on load ───────────────────────
  useEffect(() => {
    const session = loadSession();
    if (session?.roomCode && session?.playerId) {
      dispatch({ type: 'PATCH', payload: { reconnecting: true } });
      reconnectToRoom(session);
    }
  }, []);

  // ── Save session on important state changes ───────────────────
  useEffect(() => {
    const s = stateRef.current;
    if (s.playerId && s.roomCode && s.screen !== 'home') {
      saveSession({
        playerId: s.playerId, playerName: s.playerName,
        playerAvatar: s.playerAvatar, roomCode: s.roomCode,
        isSpectator: s.isSpectator,
      });
    }
  }, [state.screen, state.roomCode, state.playerId]);

  const pub = useCallback((msg) => {
    channelRef.current?.publish('game', msg);
  }, []);

  const pubPrivate = useCallback((targetPlayerId, msg) => {
    const client = getClient();
    if (!client) return;
    client.channels.get(`mafia-private-${stateRef.current.roomCode}-${targetPlayerId}`)
      .publish('private', msg);
  }, []);

  // ── Transition helper (animates between phases) ───────────────
  const transitionTo = useCallback((screen, type, payload) => {
    dispatch({ type: 'PATCH', payload: { transitioning: true, transitionType: type } });
    setTimeout(() => {
      dispatch({ type: 'PATCH', payload: { ...payload, screen, transitioning: false, transitionType: null } });
    }, 600);
  }, []);

  const connectToRoom = useCallback((roomCode, playerId) => {
    const client = getClient();
    if (!client) { dispatch({ type: 'SET_ERROR', error: 'Ably not configured.' }); return; }
    const ch = client.channels.get(`mafia-room-${roomCode}`);
    channelRef.current = ch;
    ch.subscribe((msg) => handlePublicMessage(msg.data));
    const priv = client.channels.get(`mafia-private-${roomCode}-${playerId}`);
    priv.subscribe((msg) => handlePrivateMessage(msg.data));

    // Listen for host heartbeat — detect if host disconnected
    const heartbeatCh = client.channels.get(`mafia-heartbeat-${roomCode}`);
    heartbeatCh.subscribe((msg) => {
      if (msg.data?.type === 'HOST_LEFT') handleHostLeft();
      if (msg.data?.type === 'HOST_SNAPSHOT') {
        gameStateSnapshot.current = msg.data.snapshot;
        // If reconnecting, restore state
        const s = stateRef.current;
        if (s.reconnecting) {
          const snap = msg.data.snapshot;
          dispatch({ type: 'PATCH', payload: {
            reconnecting: false, players: snap.players,
            settings: snap.settings, phase: snap.phase,
            round: snap.round, eliminatedPlayers: snap.eliminatedPlayers || [],
            gameLog: snap.gameLog || [], hostId: snap.hostId,
            rolesInGame: snap.rolesInGame || [],
            screen: snap.phase === 'lobby' ? 'lobby' : snap.phase === 'ended' ? 'ended' :
                    s.isSpectator ? 'spectate' : snap.phase === 'night' ? 'night' : 'day',
          }});
        }
      }
    });
  }, []);

  function reconnectToRoom(session) {
    const { playerId, playerName, playerAvatar, roomCode, isSpectator } = session;
    dispatch({ type: 'PATCH', payload: {
      playerId, playerName, playerAvatar, roomCode, isSpectator,
      screen: 'reconnecting',
    }});
    connectToRoom(roomCode, playerId);
    // Ask for snapshot
    setTimeout(() => {
      const ch = channelRef.current;
      ch?.publish('game', { type: 'REQUEST_SNAPSHOT', playerId });
    }, 1000);
    // Timeout if no response
    setTimeout(() => {
      if (stateRef.current.reconnecting) {
        clearSession();
        dispatch({ type: 'RESET' });
        dispatch({ type: 'SET_ERROR', error: 'Could not reconnect — room may have ended.' });
      }
    }, 8000);
  }

  function handleHostLeft() {
    const s = stateRef.current;
    if (s.phase === 'lobby' || s.phase === 'ended') return;

    // Find next player to be host (first alive non-host player)
    const nextHost = s.players.find(p => p.id !== s.hostId && p.alive);
    if (!nextHost) return;

    // If WE are the next host, take over
    if (nextHost.id === s.playerId) {
      dispatch({ type: 'PATCH', payload: { hostId: s.playerId } });
      pub({ type: 'HOST_MIGRATED', newHostId: s.playerId, newHostName: s.playerName });
      // Republish snapshot so others can update
      publishSnapshot();
    }
  }

  function publishSnapshot() {
    const s = stateRef.current;
    const client = getClient();
    if (!client) return;
    const ch = client.channels.get(`mafia-heartbeat-${s.roomCode}`);
    ch.publish('heartbeat', {
      type: 'HOST_SNAPSHOT',
      snapshot: {
        players: s.players, settings: s.settings,
        phase: s.phase, round: s.round,
        eliminatedPlayers: s.eliminatedPlayers,
        gameLog: s.gameLog, hostId: s.playerId,
        rolesInGame: s.rolesInGame,
      }
    });
  }

  function handlePublicMessage(data) {
    const s = stateRef.current;
    switch (data.type) {

      case 'REQUEST_SNAPSHOT':
        if (s.playerId === s.hostId) publishSnapshot();
        break;

      case 'HOST_MIGRATED':
        dispatch({ type: 'PATCH', payload: { hostId: data.newHostId } });
        break;

      case 'PLAYER_JOINED': {
        // Password check
        if (s.settings?.password && data.password !== s.settings.password && data.player.id !== s.playerId) {
          if (s.playerId === s.hostId) {
            pub({ type: 'PLAYER_KICKED', playerId: data.player.id, reason: 'wrong_password' });
          }
          return;
        }
        if (!s.players.find(p => p.id === data.player.id))
          dispatch({ type: 'PATCH', payload: { players: [...s.players, data.player] } });
        break;
      }

      case 'SPECTATOR_JOINED':
        if (!s.spectators.find(p => p.id === data.player.id))
          dispatch({ type: 'PATCH', payload: { spectators: [...s.spectators, data.player] } });
        break;

      case 'PLAYER_KICKED':
        if (data.playerId === s.playerId) {
          clearSession();
          dispatch({ type: 'RESET' });
          dispatch({ type: 'SET_ERROR', error: data.reason === 'wrong_password' ? 'Wrong room password.' : 'You were kicked by the host.' });
        } else {
          dispatch({ type: 'PATCH', payload: { players: s.players.filter(p => p.id !== data.playerId) } });
        }
        break;

      case 'SETTINGS_UPDATED':
        dispatch({ type: 'PATCH', payload: { settings: data.settings } });
        break;

      case 'GAME_STARTED':
        dispatch({ type: 'PATCH', payload: { rolesInGame: data.rolesInGame || [] } });
        break;

      case 'NIGHT_START':
        transitionTo(
          s.isSpectator ? 'spectate' : 'night',
          'to_night',
          { phase: 'night', round: data.round, actionConfirmed: false, detectiveResult: null, nightLog: [], votes: {}, nightAction: null }
        );
        break;

      case 'DAY_START':
        transitionTo(
          s.isSpectator ? 'spectate' : 'day',
          'to_day',
          {
            phase: 'day', nightLog: data.nightLog, players: data.players,
            eliminatedPlayers: data.eliminatedPlayers, gameLog: data.gameLog, votes: {},
            voteTimerActive: data.voteTimerSeconds > 0, voteTimerSeconds: data.voteTimerSeconds,
            lastWills: { ...s.lastWills, ...data.revealedWills },
          }
        );
        break;

      case 'VOTE_CAST':
        dispatch({ type: 'PATCH', payload: { votes: data.votes } });
        break;

      case 'PLAYER_ELIMINATED':
        dispatch({ type: 'PATCH', payload: {
          players: s.players.map(p => p.id === data.playerId ? { ...p, alive: false } : p),
          eliminatedPlayers: data.eliminatedPlayers,
          lastWills: data.lastWill ? { ...s.lastWills, [data.playerId]: data.lastWill } : s.lastWills,
        }});
        break;

      case 'GAME_ENDED':
        clearSession();
        dispatch({ type: 'PATCH', payload: {
          screen: 'ended', phase: 'ended',
          winner: data.winner, jesterWinner: data.jesterWinner,
          players: data.players, gameLog: data.gameLog,
          eliminatedPlayers: data.eliminatedPlayers,
        }});
        break;

      case 'MVP_VOTE_CAST':
        dispatch({ type: 'PATCH', payload: { mvpVotes: data.mvpVotes } });
        break;

      case 'MVP_RESULT':
        dispatch({ type: 'PATCH', payload: { mvpResult: data.mvpResult } });
        break;

      case 'GAME_RESTARTED':
        dispatch({ type: 'PATCH', payload: {
          screen: 'lobby', phase: 'lobby', round: 0,
          players: data.players, settings: data.settings,
          eliminatedPlayers: [], gameLog: [], nightLog: [],
          mafiaChat: [], deadChat: [], winner: null, jesterWinner: null,
          myRole: null, mafiaTeam: [], nightAction: null,
          actionConfirmed: false, detectiveResult: null,
          mvpVotes: {}, mvpResult: null, lastWills: {}, myLastWill: '',
          rolesInGame: [], hostId: data.hostId || s.hostId,
        }});
        break;

      case 'MAFIA_CHAT_MSG':
        if (isMafiaRole(s.myRole)) dispatch({ type: 'ADD_MAFIA_CHAT', msg: data });
        break;

      case 'DEAD_CHAT_MSG': {
        const me = s.players.find(p => p.id === s.playerId);
        if (me && !me.alive) dispatch({ type: 'ADD_DEAD_CHAT', msg: data });
        break;
      }

      case 'NIGHT_ACTIONS_RECEIVED':
        if (s.playerId === s.hostId) handleNightActionsAsHost(data.nightActions, data.round);
        break;

      case 'VOTES_RECEIVED':
        if (s.playerId === s.hostId) handleVotesAsHost(data.votes, data.round);
        break;

      case 'LAST_WILL_SUBMIT':
        lastWillsStore.current[data.playerId] = data.text;
        break;
    }
  }

  function handlePrivateMessage(data) {
    switch (data.type) {
      case 'YOUR_ROLE':
        dispatch({ type: 'PATCH', payload: {
          myRole: data.role, mafiaTeam: data.mafiaTeam || [], screen: 'role_reveal',
        }});
        break;
      case 'NIGHT_ACTION_PROMPT':
        dispatch({ type: 'PATCH', payload: {
          nightAction: { role: data.role, targets: data.targets, blockUsed: data.blockUsed },
          actionConfirmed: false, detectiveResult: null,
        }});
        break;
      case 'DETECTIVE_RESULT':
        dispatch({ type: 'PATCH', payload: {
          detectiveResult: { targetName: data.targetName, isMafia: data.isMafia }
        }});
        break;
    }
  }

  // ── HOST heartbeat — publish every 10s so others know host is alive ─
  useEffect(() => {
    const s = state;
    if (s.playerId !== s.hostId || !s.roomCode) return;
    const client = getClient();
    if (!client) return;
    const ch = client.channels.get(`mafia-heartbeat-${s.roomCode}`);
    const id = setInterval(() => {
      ch.publish('heartbeat', { type: 'ALIVE', hostId: s.playerId });
      publishSnapshot();
    }, 10000);
    return () => clearInterval(id);
  }, [state.hostId, state.playerId, state.roomCode]);

  // ── HOST logic ─────────────────────────────────────────────────
  function handleNightActionsAsHost(incoming, round) {
    const s = stateRef.current;
    if (s.round !== round) return;
    nightActionsStore.current = { ...nightActionsStore.current, ...incoming };
    if (checkNightComplete(s.players, nightActionsStore.current))
      setTimeout(() => processNightAsHost(round), 1500);
  }

  function handleVotesAsHost(incoming, round) {
    const s = stateRef.current;
    if (s.round !== round) return;
    votesStore.current = { ...votesStore.current, ...incoming };
    pub({ type: 'VOTE_CAST', votes: votesStore.current });
    if (checkVotesComplete(s.players, votesStore.current)) {
      if (voteTimerRef.current) { clearTimeout(voteTimerRef.current); voteTimerRef.current = null; }
      setTimeout(() => processVotesAsHost(round), 1500);
    }
  }

  function processNightAsHost(round) {
    const s = stateRef.current;
    const { players, eliminated, nightLog, gameLogEntries } = resolveNight(s.players, nightActionsStore.current, round);
    const newGameLog = [...s.gameLog, ...gameLogEntries];
    const newEliminated = [...s.eliminatedPlayers, ...eliminated];
    nightActionsStore.current = {};
    const revealedWills = {};
    for (const e of eliminated) {
      if (lastWillsStore.current[e.id]) revealedWills[e.id] = lastWillsStore.current[e.id];
      pub({ type: 'PLAYER_ELIMINATED', playerId: e.id, eliminatedPlayers: newEliminated, lastWill: lastWillsStore.current[e.id] || null });
    }
    const winner = checkWinCondition(players);
    if (winner) {
      pub({ type: 'GAME_ENDED', winner, jesterWinner: null, players, gameLog: newGameLog, eliminatedPlayers: newEliminated });
      return;
    }
    votesStore.current = {};
    const vs = s.settings.voteTimerSeconds;
    pub({ type: 'DAY_START', nightLog, players, eliminatedPlayers: newEliminated, gameLog: newGameLog, round, voteTimerSeconds: vs, revealedWills });
    if (vs > 0) voteTimerRef.current = setTimeout(() => processVotesAsHost(round), vs * 1000);
  }

  function processVotesAsHost(round) {
    const s = stateRef.current;
    const { players, eliminated, gameLogEntries, jesterWin } = resolveVotes(s.players, votesStore.current, round);
    const newGameLog = [...s.gameLog, ...gameLogEntries];
    const newEliminated = [...s.eliminatedPlayers, ...eliminated];
    votesStore.current = {};
    for (const e of eliminated) {
      pub({ type: 'PLAYER_ELIMINATED', playerId: e.id, eliminatedPlayers: newEliminated, lastWill: lastWillsStore.current[e.id] || null });
    }
    if (jesterWin) {
      pub({ type: 'GAME_ENDED', winner: 'jester', jesterWinner: jesterWin, players, gameLog: newGameLog, eliminatedPlayers: newEliminated });
      return;
    }
    const winner = checkWinCondition(players);
    if (winner) {
      pub({ type: 'GAME_ENDED', winner, jesterWinner: null, players, gameLog: newGameLog, eliminatedPlayers: newEliminated });
      return;
    }
    setTimeout(() => startNightAsHost(round + 1, players, newGameLog, newEliminated), 2000);
  }

  function startNightAsHost(round, playersArg, gameLogArg, eliminatedArg) {
    const s = stateRef.current;
    const players = playersArg || s.players;
    nightActionsStore.current = {};
    pub({ type: 'NIGHT_START', round });
    for (const player of players) {
      const alive = players.filter(p => p.alive);
      if (!player.alive) { pubPrivate(player.id, { type: 'NIGHT_ACTION_PROMPT', role: 'dead', targets: [] }); continue; }
      switch (player.role) {
        case 'mafia': case 'godfather': {
          const targets = alive.filter(p => !isMafiaRole(p.role)).map(p => ({ id: p.id, name: p.name, avatar: p.avatar }));
          pubPrivate(player.id, { type: 'NIGHT_ACTION_PROMPT', role: player.role, targets }); break;
        }
        case 'doctor':
          pubPrivate(player.id, { type: 'NIGHT_ACTION_PROMPT', role: 'doctor', targets: alive.map(p => ({ id: p.id, name: p.name, avatar: p.avatar })) }); break;
        case 'detective':
          pubPrivate(player.id, { type: 'NIGHT_ACTION_PROMPT', role: 'detective', targets: alive.filter(p => p.id !== player.id).map(p => ({ id: p.id, name: p.name, avatar: p.avatar })) }); break;
        case 'sheriff':
          pubPrivate(player.id, { type: 'NIGHT_ACTION_PROMPT', role: player.sheriffShotUsed ? 'sheriff_used' : 'sheriff', targets: alive.filter(p => p.id !== player.id).map(p => ({ id: p.id, name: p.name, avatar: p.avatar })) }); break;
        case 'witch':
          pubPrivate(player.id, { type: 'NIGHT_ACTION_PROMPT', role: 'witch', targets: alive.filter(p => p.id !== player.id).map(p => ({ id: p.id, name: p.name, avatar: p.avatar })), blockUsed: player.witchBlockUsed }); break;
        case 'bodyguard':
          pubPrivate(player.id, { type: 'NIGHT_ACTION_PROMPT', role: 'bodyguard', targets: alive.filter(p => p.id !== player.id).map(p => ({ id: p.id, name: p.name, avatar: p.avatar })) }); break;
        default:
          pubPrivate(player.id, { type: 'NIGHT_ACTION_PROMPT', role: player.role, targets: [] });
      }
    }
  }

  // ── Public actions ─────────────────────────────────────────────
  const actions = {
    createRoom: (name, avatar) => {
      const playerId = crypto.randomUUID();
      const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
      dispatch({ type: 'PATCH', payload: {
        playerId, playerName: name, playerAvatar: avatar, roomCode, hostId: playerId,
        players: [{ id: playerId, name, avatar, alive: true, role: null, isHost: true }],
        screen: 'lobby',
      }});
      connectToRoom(roomCode, playerId);
      setTimeout(() => pub({ type: 'PLAYER_JOINED', player: { id: playerId, name, avatar, alive: true, isHost: true }, password: '' }), 800);
    },

    joinRoom: (name, avatar, roomCode, password) => {
      const playerId = crypto.randomUUID();
      dispatch({ type: 'PATCH', payload: { playerId, playerName: name, playerAvatar: avatar, roomCode, screen: 'lobby' } });
      connectToRoom(roomCode, playerId);
      setTimeout(() => pub({ type: 'PLAYER_JOINED', player: { id: playerId, name, avatar, alive: true, isHost: false }, password }), 800);
    },

    joinAsSpectator: (name, avatar, roomCode) => {
      const playerId = crypto.randomUUID();
      dispatch({ type: 'PATCH', payload: { playerId, playerName: name, playerAvatar: avatar, roomCode, screen: 'lobby', isSpectator: true } });
      connectToRoom(roomCode, playerId);
      setTimeout(() => pub({ type: 'SPECTATOR_JOINED', player: { id: playerId, name, avatar } }), 800);
    },

    kickPlayer: (targetId) => {
      const s = stateRef.current;
      if (s.playerId !== s.hostId) return;
      dispatch({ type: 'PATCH', payload: { players: s.players.filter(p => p.id !== targetId) } });
      pub({ type: 'PLAYER_KICKED', playerId: targetId });
    },

    startGame: () => {
      const s = stateRef.current;
      if (s.playerId !== s.hostId) return;
      const assignedPlayers = assignRoles(s.players, s.settings);
      const rolesInGame = [...new Set(assignedPlayers.map(p => p.role))];
      for (const player of assignedPlayers) {
        const mafiaTeam = isMafiaRole(player.role)
          ? assignedPlayers.filter(p => isMafiaRole(p.role) && p.id !== player.id).map(p => ({ id: p.id, name: p.name, role: p.role, avatar: p.avatar }))
          : [];
        pubPrivate(player.id, { type: 'YOUR_ROLE', role: player.role, mafiaTeam });
      }
      dispatch({ type: 'PATCH', payload: { players: assignedPlayers, rolesInGame } });
      pub({ type: 'GAME_STARTED', rolesInGame });
      setTimeout(() => startNightAsHost(1, assignedPlayers, [], []), 3000);
    },

    updateSettings: (settings) => {
      const s = stateRef.current;
      if (s.playerId !== s.hostId) return;
      const newSettings = { ...s.settings, ...settings };
      dispatch({ type: 'PATCH', payload: { settings: newSettings } });
      pub({ type: 'SETTINGS_UPDATED', settings: newSettings });
    },

    submitNightAction: (targetId, actionType) => {
      const s = stateRef.current;
      const player = s.players.find(p => p.id === s.playerId);
      let actions_update = {};
      if (!player?.alive) {
        actions_update[`skip_${s.playerId}`] = 'done';
      } else {
        const role = player.role;
        if (role === 'mafia' || role === 'godfather') actions_update['mafia'] = targetId;
        else if (role === 'doctor') actions_update['doctor'] = targetId;
        else if (role === 'detective') {
          actions_update['detective'] = targetId;
          const target = s.players.find(p => p.id === targetId);
          if (target) dispatch({ type: 'PATCH', payload: { detectiveResult: { targetName: target.name, isMafia: target.role === 'mafia' } } });
        }
        else if (role === 'sheriff') { actions_update['sheriff'] = targetId; }
        else if (role === 'bodyguard') actions_update['bodyguard'] = targetId;
        else if (role === 'witch') {
          if (actionType === 'block') actions_update['witch_block'] = targetId;
          actions_update[`skip_${s.playerId}`] = 'done';
        }
        else actions_update[`skip_${s.playerId}`] = 'done';
      }
      dispatch({ type: 'PATCH', payload: { actionConfirmed: true } });
      pub({ type: 'NIGHT_ACTIONS_RECEIVED', nightActions: actions_update, round: s.round });
    },

    castVote: (targetId) => {
      const s = stateRef.current;
      pub({ type: 'VOTES_RECEIVED', votes: { [s.playerId]: targetId }, round: s.round });
    },

    castMvpVote: (targetId) => {
      const s = stateRef.current;
      const newMvpVotes = { ...s.mvpVotes, [s.playerId]: targetId };
      dispatch({ type: 'PATCH', payload: { mvpVotes: newMvpVotes } });
      pub({ type: 'MVP_VOTE_CAST', mvpVotes: newMvpVotes });
      if (s.playerId === s.hostId) {
        const tally = {};
        for (const v of Object.values(newMvpVotes)) tally[v] = (tally[v] || 0) + 1;
        const mvp = Object.entries(tally).sort((a,b)=>b[1]-a[1])[0];
        const mvpPlayer = s.players.find(p => p.id === mvp?.[0]);
        if (mvpPlayer) pub({ type: 'MVP_RESULT', mvpResult: { name: mvpPlayer.name, avatar: mvpPlayer.avatar, votes: mvp[1] } });
      }
    },

    saveLastWill: (text) => {
      const s = stateRef.current;
      dispatch({ type: 'SET_LAST_WILL', text });
      pub({ type: 'LAST_WILL_SUBMIT', playerId: s.playerId, text });
    },

    sendMafiaChat: (text) => {
      const s = stateRef.current;
      pub({ type: 'MAFIA_CHAT_MSG', sender: s.playerName, avatar: s.playerAvatar, text, time: Date.now() });
    },

    sendDeadChat: (text) => {
      const s = stateRef.current;
      pub({ type: 'DEAD_CHAT_MSG', sender: s.playerName, avatar: s.playerAvatar, text, time: Date.now() });
    },

    restartGame: () => {
      const s = stateRef.current;
      if (s.playerId !== s.hostId) return;
      lastWillsStore.current = {};
      const cleanPlayers = s.players.map(p => ({ ...p, role: null, alive: true }));
      pub({ type: 'GAME_RESTARTED', players: cleanPlayers, settings: s.settings, hostId: s.playerId });
    },

    clearError: () => dispatch({ type: 'CLEAR_ERROR' }),
  };

  return (
    <GameContext.Provider value={{ state, actions }}>
      {children}
    </GameContext.Provider>
  );
}

export const useGame = () => useContext(GameContext);

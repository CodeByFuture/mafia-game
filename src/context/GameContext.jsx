import { createContext, useContext, useReducer, useCallback, useRef } from 'react';
import * as Ably from 'ably';
import {
  assignRoles, checkWinCondition, resolveNight, resolveVotes,
  checkNightComplete, checkVotesComplete, isMafiaRole
} from '../engine';

const GameContext = createContext(null);

const initialState = {
  screen: 'home',
  playerId: null, playerName: null, playerAvatar: '🎭',
  myRole: null, mafiaTeam: [],
  roomCode: null, players: [],
  phase: 'lobby', round: 0,
  settings: {
    mafiaCount: 1, hasDoctor: true, hasDetective: true,
    hasJester: false, jesterCount: 1, hasSheriff: false,
    hasGodfather: false, hasBomber: false, hasWitch: false,
    hasMayor: false, hasBodyguard: false,
    voteTimerSeconds: 0, password: '',
  },
  hostId: null, eliminatedPlayers: [], gameLog: [], nightLog: [],
  nightAction: null, detectiveResult: null, actionConfirmed: false,
  votes: {}, mafiaChat: [], deadChat: [],
  voteTimerSeconds: 0, voteTimerActive: false,
  winner: null, jesterWinner: null,
  mvpVotes: {}, mvpResult: null, lastWills: {}, myLastWill: '',
  error: null, rolesInGame: [],
  transitioning: false, transitionType: null,
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

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Each tab gets its own everything - stored in refs not module scope
  const ablyRef = useRef(null);
  const channelRef = useRef(null);
  const myIdRef = useRef(null);
  const nightActionsStore = useRef({});
  const votesStore = useRef({});
  const voteTimerRef = useRef(null);
  const lastWillsStore = useRef({});

  const pub = useCallback((msg) => {
    channelRef.current?.publish('game', msg);
  }, []);

  const pubPrivate = useCallback((targetId, msg) => {
    const roomCode = stateRef.current.roomCode;
    ablyRef.current?.channels
      .get(`mafia-private-${roomCode}-${targetId}`)
      .publish('private', msg);
  }, []);

  const transitionTo = useCallback((screen, type, payload) => {
    dispatch({ type: 'PATCH', payload: { transitioning: true, transitionType: type } });
    setTimeout(() => {
      dispatch({ type: 'PATCH', payload: { ...payload, screen, transitioning: false, transitionType: null } });
    }, 600);
  }, []);

  const connectToRoom = useCallback((roomCode, playerId) => {
    const key = import.meta.env.VITE_ABLY_KEY;
    if (!key) { dispatch({ type: 'SET_ERROR', error: 'No Ably key found.' }); return; }

    // Fresh Ably instance per tab - stored in ref not module variable
    const ably = new Ably.Realtime({ key, clientId: playerId });
    ablyRef.current = ably;
    myIdRef.current = playerId;

    ably.connection.on('failed', () => {
      dispatch({ type: 'SET_ERROR', error: 'Connection failed. Check internet.' });
    });

    // Public channel
    const ch = ably.channels.get(`mafia-room-${roomCode}`);
    channelRef.current = ch;
    ch.subscribe('game', (msg) => handleMsg(msg.data));

    // Private channel
    ably.channels.get(`mafia-private-${roomCode}-${playerId}`)
      .subscribe('private', (msg) => handlePrivate(msg.data));

  }, []); // eslint-disable-line

  function handleMsg(data) {
    const s = stateRef.current;
    const myId = myIdRef.current;

    switch (data.type) {

      case 'PLAYER_JOINED': {
        // Skip if already in list
        if (s.players.find(p => p.id === data.player.id)) break;
        const newPlayers = [...s.players, data.player];
        dispatch({ type: 'PATCH', payload: { players: newPlayers, hostId: data.hostId || s.hostId } });
        break;
      }

      case 'PLAYER_LIST': {
        // Full authoritative list from host
        dispatch({ type: 'PATCH', payload: {
          players: data.players,
          hostId: data.hostId,
          settings: data.settings || s.settings,
        }});
        break;
      }

      case 'SETTINGS_UPDATED':
        dispatch({ type: 'PATCH', payload: { settings: data.settings } });
        break;

      case 'KICKED':
        if (data.playerId === myId) {
          dispatch({ type: 'RESET' });
          dispatch({ type: 'SET_ERROR', error: data.reason || 'You were kicked.' });
        } else {
          dispatch({ type: 'PATCH', payload: {
            players: s.players.filter(p => p.id !== data.playerId)
          }});
        }
        break;

      case 'GAME_STARTED':
        dispatch({ type: 'PATCH', payload: { rolesInGame: data.rolesInGame || [] } });
        break;

      case 'NIGHT_START':
        transitionTo('night', 'to_night', {
          phase: 'night', round: data.round,
          actionConfirmed: false, detectiveResult: null,
          nightLog: [], votes: {}, nightAction: null
        });
        break;

      case 'DAY_START':
        transitionTo('day', 'to_day', {
          phase: 'day', nightLog: data.nightLog,
          players: data.players, eliminatedPlayers: data.eliminatedPlayers,
          gameLog: data.gameLog, votes: {},
          voteTimerActive: data.voteTimerSeconds > 0,
          voteTimerSeconds: data.voteTimerSeconds,
          lastWills: { ...s.lastWills, ...(data.revealedWills || {}) },
        });
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
          players: data.players, settings: data.settings, hostId: data.hostId,
          eliminatedPlayers: [], gameLog: [], nightLog: [],
          mafiaChat: [], deadChat: [], winner: null, jesterWinner: null,
          myRole: null, mafiaTeam: [], nightAction: null,
          actionConfirmed: false, detectiveResult: null,
          mvpVotes: {}, mvpResult: null, lastWills: {}, myLastWill: '',
          rolesInGame: [],
        }});
        break;

      case 'MAFIA_CHAT_MSG':
        if (isMafiaRole(s.myRole))
          dispatch({ type: 'ADD_MAFIA_CHAT', msg: data });
        break;

      case 'DEAD_CHAT_MSG': {
        const me = s.players.find(p => p.id === myId);
        if (me && !me.alive)
          dispatch({ type: 'ADD_DEAD_CHAT', msg: data });
        break;
      }

      case 'LAST_WILL_SUBMIT':
        lastWillsStore.current[data.playerId] = data.text;
        break;

      case 'NIGHT_ACTIONS_RECEIVED':
        if (myId === s.hostId) handleNightActions(data.nightActions, data.round);
        break;

      case 'VOTES_RECEIVED':
        if (myId === s.hostId) handleVotes(data.votes, data.round);
        break;

      case 'REQUEST_LIST':
        // Someone is asking for the player list - only host responds
        if (myId === s.hostId) {
          pub({ type: 'PLAYER_LIST', players: stateRef.current.players, hostId: myId, settings: stateRef.current.settings });
        }
        break;
    }
  }

  function handlePrivate(data) {
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

  function handleNightActions(incoming, round) {
    const s = stateRef.current;
    if (s.round !== round) return;
    nightActionsStore.current = { ...nightActionsStore.current, ...incoming };
    if (checkNightComplete(s.players, nightActionsStore.current))
      setTimeout(() => resolveNightPhase(round), 1500);
  }

  function handleVotes(incoming, round) {
    const s = stateRef.current;
    if (s.round !== round) return;
    votesStore.current = { ...votesStore.current, ...incoming };
    pub({ type: 'VOTE_CAST', votes: votesStore.current });
    if (checkVotesComplete(s.players, votesStore.current)) {
      if (voteTimerRef.current) { clearTimeout(voteTimerRef.current); voteTimerRef.current = null; }
      setTimeout(() => resolveDayPhase(round), 1500);
    }
  }

  function resolveNightPhase(round) {
    const s = stateRef.current;
    const { players, eliminated, nightLog, gameLogEntries } = resolveNight(s.players, nightActionsStore.current, round);
    const newGameLog = [...s.gameLog, ...gameLogEntries];
    const newEliminated = [...s.eliminatedPlayers, ...eliminated];
    nightActionsStore.current = {};
    const revealedWills = {};
    for (const e of eliminated) {
      const will = lastWillsStore.current[e.id];
      if (will) revealedWills[e.id] = will;
      pub({ type: 'PLAYER_ELIMINATED', playerId: e.id, eliminatedPlayers: newEliminated, lastWill: will || null });
    }
    const winner = checkWinCondition(players);
    if (winner) {
      pub({ type: 'GAME_ENDED', winner, jesterWinner: null, players, gameLog: newGameLog, eliminatedPlayers: newEliminated });
      return;
    }
    votesStore.current = {};
    const vs = s.settings.voteTimerSeconds;
    pub({ type: 'DAY_START', nightLog, players, eliminatedPlayers: newEliminated, gameLog: newGameLog, round, voteTimerSeconds: vs, revealedWills });
    if (vs > 0) voteTimerRef.current = setTimeout(() => resolveDayPhase(round), vs * 1000);
  }

  function resolveDayPhase(round) {
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
    setTimeout(() => startNight(round + 1, players, newGameLog, newEliminated), 2000);
  }

  function startNight(round, playersArg) {
    const players = playersArg || stateRef.current.players;
    nightActionsStore.current = {};
    pub({ type: 'NIGHT_START', round });
    for (const player of players) {
      const alive = players.filter(p => p.alive);
      const t = (f) => alive.filter(f).map(p => ({ id: p.id, name: p.name, avatar: p.avatar }));
      if (!player.alive) { pubPrivate(player.id, { type: 'NIGHT_ACTION_PROMPT', role: 'dead', targets: [] }); continue; }
      switch (player.role) {
        case 'mafia': case 'godfather':
          pubPrivate(player.id, { type: 'NIGHT_ACTION_PROMPT', role: player.role, targets: t(p => !isMafiaRole(p.role)) }); break;
        case 'doctor':
          pubPrivate(player.id, { type: 'NIGHT_ACTION_PROMPT', role: 'doctor', targets: t(() => true) }); break;
        case 'detective':
          pubPrivate(player.id, { type: 'NIGHT_ACTION_PROMPT', role: 'detective', targets: t(p => p.id !== player.id) }); break;
        case 'sheriff':
          pubPrivate(player.id, { type: 'NIGHT_ACTION_PROMPT', role: player.sheriffShotUsed ? 'sheriff_used' : 'sheriff', targets: t(p => p.id !== player.id) }); break;
        case 'witch':
          pubPrivate(player.id, { type: 'NIGHT_ACTION_PROMPT', role: 'witch', targets: t(p => p.id !== player.id), blockUsed: player.witchBlockUsed }); break;
        case 'bodyguard':
          pubPrivate(player.id, { type: 'NIGHT_ACTION_PROMPT', role: 'bodyguard', targets: t(p => p.id !== player.id) }); break;
        default:
          pubPrivate(player.id, { type: 'NIGHT_ACTION_PROMPT', role: player.role, targets: [] });
      }
    }
  }

  const actions = {

    createRoom: (name, avatar) => {
      const playerId = crypto.randomUUID();
      const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
      const player = { id: playerId, name, avatar, alive: true, role: null, isHost: true };
      dispatch({ type: 'PATCH', payload: {
        playerId, playerName: name, playerAvatar: avatar,
        roomCode, hostId: playerId,
        players: [player],
        screen: 'lobby',
      }});
      connectToRoom(roomCode, playerId);
      // Wait for Ably connection before publishing
      const waitAndPublish = () => {
        const ably = ablyRef.current;
        if (!ably) { setTimeout(waitAndPublish, 200); return; }
        if (ably.connection.state === 'connected') {
          pub({ type: 'PLAYER_JOINED', player, hostId: playerId });
        } else {
          ably.connection.once('connected', () => {
            pub({ type: 'PLAYER_JOINED', player, hostId: playerId });
          });
        }
      };
      setTimeout(waitAndPublish, 300);
    },

    joinRoom: (name, avatar, roomCode, password) => {
      const playerId = crypto.randomUUID();
      const player = { id: playerId, name, avatar, alive: true, role: null, isHost: false };
      dispatch({ type: 'PATCH', payload: {
        playerId, playerName: name, playerAvatar: avatar, roomCode, screen: 'lobby',
        players: [player],
      }});
      connectToRoom(roomCode, playerId);
      const waitAndPublish = () => {
        const ably = ablyRef.current;
        if (!ably) { setTimeout(waitAndPublish, 200); return; }
        if (ably.connection.state === 'connected') {
          pub({ type: 'PLAYER_JOINED', player, password: password || '' });
          setTimeout(() => pub({ type: 'REQUEST_LIST' }), 500);
        } else {
          ably.connection.once('connected', () => {
            pub({ type: 'PLAYER_JOINED', player, password: password || '' });
            setTimeout(() => pub({ type: 'REQUEST_LIST' }), 500);
          });
        }
      };
      setTimeout(waitAndPublish, 300);
    },

    kickPlayer: (targetId) => {
      const s = stateRef.current;
      if (myIdRef.current !== s.hostId) return;
      dispatch({ type: 'PATCH', payload: { players: s.players.filter(p => p.id !== targetId) } });
      pub({ type: 'KICKED', playerId: targetId });
    },

    startGame: () => {
      const s = stateRef.current;
      if (myIdRef.current !== s.hostId) return;
      const assignedPlayers = assignRoles(s.players, s.settings);
      const rolesInGame = [...new Set(assignedPlayers.map(p => p.role))];
      for (const player of assignedPlayers) {
        const mafiaTeam = isMafiaRole(player.role)
          ? assignedPlayers.filter(p => isMafiaRole(p.role) && p.id !== player.id)
              .map(p => ({ id: p.id, name: p.name, role: p.role, avatar: p.avatar }))
          : [];
        pubPrivate(player.id, { type: 'YOUR_ROLE', role: player.role, mafiaTeam });
      }
      dispatch({ type: 'PATCH', payload: { players: assignedPlayers, rolesInGame } });
      pub({ type: 'GAME_STARTED', rolesInGame });
      setTimeout(() => startNight(1, assignedPlayers), 3000);
    },

    updateSettings: (settings) => {
      const s = stateRef.current;
      if (myIdRef.current !== s.hostId) return;
      const newSettings = { ...s.settings, ...settings };
      dispatch({ type: 'PATCH', payload: { settings: newSettings } });
      pub({ type: 'SETTINGS_UPDATED', settings: newSettings });
    },

    submitNightAction: (targetId, actionType) => {
      const s = stateRef.current;
      const myId = myIdRef.current;
      const player = s.players.find(p => p.id === myId);
      let update = {};
      if (!player?.alive) {
        update[`skip_${myId}`] = 'done';
      } else {
        const role = player.role;
        if (role === 'mafia' || role === 'godfather') update['mafia'] = targetId;
        else if (role === 'doctor') update['doctor'] = targetId;
        else if (role === 'detective') {
          update['detective'] = targetId;
          const target = s.players.find(p => p.id === targetId);
          if (target) dispatch({ type: 'PATCH', payload: { detectiveResult: { targetName: target.name, isMafia: target.role === 'mafia' } } });
        }
        else if (role === 'sheriff') update['sheriff'] = targetId;
        else if (role === 'bodyguard') update['bodyguard'] = targetId;
        else if (role === 'witch') {
          if (actionType === 'block') update['witch_block'] = targetId;
          update[`skip_${myId}`] = 'done';
        }
        else update[`skip_${myId}`] = 'done';
      }
      dispatch({ type: 'PATCH', payload: { actionConfirmed: true } });
      pub({ type: 'NIGHT_ACTIONS_RECEIVED', nightActions: update, round: s.round });
    },

    castVote: (targetId) => {
      const s = stateRef.current;
      pub({ type: 'VOTES_RECEIVED', votes: { [myIdRef.current]: targetId }, round: s.round });
    },

    castMvpVote: (targetId) => {
      const s = stateRef.current;
      const myId = myIdRef.current;
      const newMvpVotes = { ...s.mvpVotes, [myId]: targetId };
      dispatch({ type: 'PATCH', payload: { mvpVotes: newMvpVotes } });
      pub({ type: 'MVP_VOTE_CAST', mvpVotes: newMvpVotes });
      if (myId === s.hostId) {
        const tally = {};
        for (const v of Object.values(newMvpVotes)) tally[v] = (tally[v] || 0) + 1;
        const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
        const mvpPlayer = s.players.find(p => p.id === top?.[0]);
        if (mvpPlayer) pub({ type: 'MVP_RESULT', mvpResult: { name: mvpPlayer.name, avatar: mvpPlayer.avatar, votes: top[1] } });
      }
    },

    saveLastWill: (text) => {
      dispatch({ type: 'SET_LAST_WILL', text });
      pub({ type: 'LAST_WILL_SUBMIT', playerId: myIdRef.current, text });
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
      if (myIdRef.current !== s.hostId) return;
      lastWillsStore.current = {};
      const cleanPlayers = s.players.map(p => ({ ...p, role: null, alive: true }));
      pub({ type: 'GAME_RESTARTED', players: cleanPlayers, settings: s.settings, hostId: myIdRef.current });
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

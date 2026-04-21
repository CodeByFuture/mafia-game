import { useGame } from './context/GameContext';
import HomeScreen from './pages/HomeScreen';
import LobbyScreen from './pages/LobbyScreen';
import RoleRevealScreen from './pages/RoleRevealScreen';
import NightScreen from './pages/NightScreen';
import DayScreen from './pages/DayScreen';
import EndedScreen from './pages/EndedScreen';
import SpectateScreen from './pages/SpectateScreen';

function ReconnectingScreen() {
  return (
    <div className="screen reconnect-screen">
      <div className="night-atmosphere" />
      <div className="night-center">
        <div className="moon" style={{ fontSize: 48 }}>🔄</div>
        <h2>Reconnecting...</h2>
        <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>Getting back into the game</p>
        <div className="waiting-dots" style={{ marginTop: 16 }}><span /><span /><span /></div>
      </div>
    </div>
  );
}

function TransitionOverlay({ type }) {
  return (
    <div className={`transition-overlay ${type}`}>
      <div className="transition-content">
        {type === 'to_night' ? (
          <>
            <div className="trans-moon">🌙</div>
            <p className="trans-text">Night Falls...</p>
          </>
        ) : (
          <>
            <div className="trans-sun">☀️</div>
            <p className="trans-text">Dawn Breaks...</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const { state } = useGame();
  const { screen, transitioning, transitionType, reconnecting } = state;

  if (reconnecting) return <ReconnectingScreen />;

  const screens = {
    home: <HomeScreen />,
    lobby: <LobbyScreen />,
    role_reveal: <RoleRevealScreen />,
    night: <NightScreen />,
    day: <DayScreen />,
    ended: <EndedScreen />,
    spectate: <SpectateScreen />,
    reconnecting: <ReconnectingScreen />,
  };

  return (
    <div className="app">
      {screens[screen] || <HomeScreen />}
      {transitioning && <TransitionOverlay type={transitionType} />}
    </div>
  );
}

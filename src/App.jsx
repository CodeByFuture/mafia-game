import { useGame } from './context/GameContext';
import HomeScreen from './pages/HomeScreen';
import LobbyScreen from './pages/LobbyScreen';
import RoleRevealScreen from './pages/RoleRevealScreen';
import NightScreen from './pages/NightScreen';
import DayScreen from './pages/DayScreen';
import EndedScreen from './pages/EndedScreen';

function TransitionOverlay({ type }) {
  return (
    <div className={`transition-overlay ${type}`}>
      <div className="transition-content">
        {type === 'to_night' ? (
          <><div className="trans-moon">🌙</div><p className="trans-text">Night Falls...</p></>
        ) : (
          <><div className="trans-sun">☀️</div><p className="trans-text">Dawn Breaks...</p></>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const { state } = useGame();
  const { screen, transitioning, transitionType } = state;

  const screens = {
    home: <HomeScreen />,
    lobby: <LobbyScreen />,
    role_reveal: <RoleRevealScreen />,
    night: <NightScreen />,
    day: <DayScreen />,
    ended: <EndedScreen />,
  };

  return (
    <div className="app">
      {screens[screen] || <HomeScreen />}
      {transitioning && <TransitionOverlay type={transitionType} />}
    </div>
  );
}

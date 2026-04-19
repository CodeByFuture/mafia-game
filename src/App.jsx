import { useGame } from './context/GameContext';
import HomeScreen from './pages/HomeScreen';
import LobbyScreen from './pages/LobbyScreen';
import RoleRevealScreen from './pages/RoleRevealScreen';
import NightScreen from './pages/NightScreen';
import DayScreen from './pages/DayScreen';
import EndedScreen from './pages/EndedScreen';

function App() {
  const { state } = useGame();
  const { screen } = state;

  const screens = {
    home: <HomeScreen />,
    lobby: <LobbyScreen />,
    role_reveal: <RoleRevealScreen />,
    night: <NightScreen />,
    day: <DayScreen />,
    ended: <EndedScreen />,
  };

  return <div className="app">{screens[screen] || <HomeScreen />}</div>;
}

export default App;

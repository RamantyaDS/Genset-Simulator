import { createRoot } from 'react-dom/client';
import { PlantApp } from './plant/PlantApp';
import { useUI } from './store';
import { App } from './ui/App';
import './ui/styles.css';
import './plant/plant.css';

/** One site, two modes: the single genset, or the five-unit power plant. */
function Root() {
  const mode = useUI((s) => s.mode);
  return mode === 'plant' ? <PlantApp /> : <App />;
}

createRoot(document.getElementById('root')!).render(<Root />);

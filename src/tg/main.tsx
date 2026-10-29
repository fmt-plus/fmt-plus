// Standalone entry for the Mini App (tg.html) — used in dev and as a fallback; the site mounts <MiniApp /> on /tg.
import { createRoot } from 'react-dom/client';
import '../fonts.ts';
import '@fontsource/instrument-serif/400.css';
import { startLiveData } from '../state/live.ts';
import { MiniApp } from './MiniApp.tsx';

startLiveData();
createRoot(document.getElementById('root')!).render(<MiniApp />);

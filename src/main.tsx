import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts.ts';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import './styles/grid.css';
import './styles/drafts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/kit.css';
import './styles/shell.css';
import './styles/home.css';
import './styles/docs.css';
import './styles/motion.css';
import { brand } from './brand.ts';
import { startWallets } from './core/wallet.ts';
import { startLiveData } from './state/live.ts';
import { App } from './App.tsx';

document.documentElement.dataset.motion = brand.motion;
document.documentElement.dataset.signature = brand.signature;
startLiveData();
startWallets();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

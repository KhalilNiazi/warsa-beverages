import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerServiceWorker } from './utils/serviceWorker';

// Register offline caching Service Worker and network synchronization listeners
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

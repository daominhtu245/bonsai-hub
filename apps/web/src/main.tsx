import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initMonitoring } from './lib/monitoring';
import './styles/index.css';

void initMonitoring();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

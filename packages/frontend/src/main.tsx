import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { OdinConnectProvider } from './odin/OdinConnectProvider';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element #root not found');
}

createRoot(root).render(
  <StrictMode>
    <OdinConnectProvider>
      <App />
    </OdinConnectProvider>
  </StrictMode>,
);

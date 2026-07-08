import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Force a single React instance. The pnpm workspace can otherwise resolve a
  // second copy for React-context libraries (react-i18next), which trips
  // "Invalid hook call" / "Cannot read properties of null (reading 'useContext')"
  // in the dev server.
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});

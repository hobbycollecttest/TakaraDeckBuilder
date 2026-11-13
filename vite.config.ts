import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Two pages share one app: / is HORO-BEAT and /haikyu is Haikyu!! VOBACA!! BREAK.
export default defineConfig({ plugins: [react()], build: { rollupOptions: { input: { main: 'index.html', haikyu: 'haikyu.html' } } } })

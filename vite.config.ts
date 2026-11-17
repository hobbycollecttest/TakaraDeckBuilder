import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Two pages share one app: / is HORO-BEAT and /haikyu is Haikyu!! VOBACA!! BREAK.
// /play and /haikyu/play are the simulators, which load on their own so the deck builder stays light.
export default defineConfig({ plugins: [react()], build: { rollupOptions: { input: { main: 'index.html', haikyu: 'haikyu.html', play: 'play.html', haikyuPlay: 'haikyu/play.html' } } } })

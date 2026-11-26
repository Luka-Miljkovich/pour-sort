import './styles.css';
import { App } from './ui/app';

// Block pinch / double-tap zoom gestures that iOS can still trigger.
for (const ev of ['gesturestart', 'gesturechange', 'dblclick']) {
  document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
}
document.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length > 1 || !(e.target as HTMLElement).closest('.scrollable')) e.preventDefault();
  },
  { passive: false },
);
document.addEventListener('contextmenu', (e) => e.preventDefault());

const app = new App(document.getElementById('app')!);
void app.start();
// handy for debugging in Safari Web Inspector
(window as any).__pour = app;

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW registration failed', err));
  });
}

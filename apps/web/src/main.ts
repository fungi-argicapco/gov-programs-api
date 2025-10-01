import './app.css';
import App from './App.svelte';

const target = document.getElementById('app');

if (!target) {
  throw new Error('Unable to locate #app root element');
}

const app = new App({
  target
});

export default app;

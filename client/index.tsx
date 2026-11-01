import ViewerTheme from './src/components/ViewerTheme';
import ReactDOM from 'react-dom/client';
import App from './src/App';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root.');
ReactDOM.createRoot(root).render(
  <ViewerTheme>
    <App />
  </ViewerTheme>,
);

// Register the no-op service worker so Chrome treats the site as installable.
// Installing it as an app is what registers the log file types with the OS, so
// "Open With > Cato Client Log Viewer" appears in Finder / Explorer.
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

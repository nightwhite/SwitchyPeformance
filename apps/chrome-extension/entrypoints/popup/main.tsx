import { createRoot } from 'react-dom/client';

import { PopupApp } from './PopupApp.tsx';
import './style.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Popup root is missing');
}

createRoot(root).render(<PopupApp />);

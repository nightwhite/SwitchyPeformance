import { createRoot } from 'react-dom/client';

import { PopupApp } from './PopupApp.tsx';
import './style.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('弹窗根节点不存在');
}

createRoot(root).render(<PopupApp />);

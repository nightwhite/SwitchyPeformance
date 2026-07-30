import { createRoot } from 'react-dom/client';

import { OptionsApp } from './OptionsApp.tsx';
import './style.css';
import '../../src/ui/original/original-options.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('设置页根节点不存在');
}

createRoot(root).render(<OptionsApp />);

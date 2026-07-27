import { createRoot } from 'react-dom/client';

import { OptionsApp } from './OptionsApp.tsx';
import './style.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Options root is missing');
}

createRoot(root).render(<OptionsApp />);

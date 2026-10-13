import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// Proteção contra clickjacking: o GitHub Pages não permite o cabeçalho frame-ancestors.
if (window.top !== window.self) {
  document.body.textContent = 'Por segurança, este sistema não pode ser aberto dentro de outra página.';
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

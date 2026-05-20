import React from 'react';
import { createRoot } from 'react-dom/client';
import { PopupApp } from './PopupApp';
import './styles.css';

const root = document.getElementById('root')!;
createRoot(root).render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>
);

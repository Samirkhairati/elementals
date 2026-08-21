import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'
import './index.css'

const env = (import.meta as any).env || {};
const worktree = env.VITE_WORKTREE_NAME || (typeof window !== 'undefined' && window.location.port && window.location.port !== '5174' ? `port ${window.location.port}` : 'main');
const port = env.VITE_PORT || (typeof window !== 'undefined' ? window.location.port || '5174' : '5174');
if (typeof document !== 'undefined') {
  document.title = `Elementals Editor — [${worktree}] (Port: ${port})`;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)

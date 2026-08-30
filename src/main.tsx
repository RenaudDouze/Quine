import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Désactive automatiquement les animations basées sur des transforms
        (framer-motion) pour les utilisateurs ayant activé la préférence
        système "mouvement réduit" (glisser-déposer des grilles...), comme
        dans +1. */}
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
)

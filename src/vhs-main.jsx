import React from 'react'
import ReactDOM from 'react-dom/client'
import VhsSlot from './VhsSlot'

// Монтируем React компонент в существующий DOM
const rootElement = document.getElementById('vhs-root')
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <VhsSlot />
    </React.StrictMode>
  )
}


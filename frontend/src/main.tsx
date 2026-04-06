import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { resetPersistedAppStateOnce } from '@/utils/bootstrapStorage'

resetPersistedAppStateOnce()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

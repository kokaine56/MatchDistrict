import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

import { ThemeProvider } from './ThemeContext.jsx'
import { UserProvider } from './UserContext.jsx'
import { SubscriptionProvider } from './contexts/SubscriptionContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <UserProvider>
          <SubscriptionProvider>
            <App />
          </SubscriptionProvider>
        </UserProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)

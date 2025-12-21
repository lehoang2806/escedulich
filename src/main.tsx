import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import '~/styles/global.css'
import '~/styles/index.css'
import App from '~/App'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeContextProvider } from './contexts/theme/themeProvider'

const rootEl = document.getElementById('root')

if (!rootEl) {
  throw new Error('Root element with id "root" not found')
}

createRoot(rootEl).render(
  <BrowserRouter>
    <ThemeContextProvider>
      <CssBaseline />
      <App />
    </ThemeContextProvider>
  </BrowserRouter>
)

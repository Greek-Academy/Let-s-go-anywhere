import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './platform/native.css'
import { initializeStorage } from './state/storage'
import { isNativeApp } from './platform/runtime'
import { Keyboard } from '@capacitor/keyboard'

if (isNativeApp) {
  document.documentElement.classList.add('native-app')
  // Keep a Done button available for multiline inputs and use the resized WebView.
  void Keyboard.setAccessoryBarVisible({ isVisible: true }).catch(() => undefined)
  void Keyboard.addListener('keyboardWillShow', () => {
    document.documentElement.classList.add('keyboard-open')
  }).catch(() => undefined)
  void Keyboard.addListener('keyboardWillHide', () => {
    document.documentElement.classList.remove('keyboard-open')
  }).catch(() => undefined)
}

void initializeStorage().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})

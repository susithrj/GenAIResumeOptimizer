import { useCallback, useEffect, useState } from 'react'
import { Footer } from './components/Footer'
import { Hero } from './components/Hero'
import { HowSection } from './components/HowSection'
import { Nav } from './components/Nav'
import { PricingSection } from './components/PricingSection'
import { Toast } from './components/Toast'
import { ToolSection } from './components/ToolSection'
import { VsSection } from './components/VsSection'

function readStoredTheme(): 'light' | 'dark' {
  const s = localStorage.getItem('tailorcv-theme')
  return s === 'light' || s === 'dark' ? s : 'dark'
}

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(readStoredTheme)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('tailorcv-theme', theme)
  }, [theme])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2600)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  return (
    <>
      <Nav theme={theme} onToggleTheme={toggleTheme} />
      <Hero />
      <ToolSection onToast={showToast} />
      <VsSection />
      <HowSection />
      <PricingSection />
      <Footer />
      <Toast message={toast} />
    </>
  )
}

export default App

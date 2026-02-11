import { useEffect, useState } from 'react'
import logo from './assets/songbird-logo.svg'
import ChatPage from './pages/ChatPage.jsx'
import AuthPage from './pages/AuthPage.jsx'

const API_BASE = ''

function getRoute(pathname) {
  if (pathname === '/signup') return 'signup'
  if (pathname === '/chat') return 'chat'
  return 'login'
}

export default function App() {
  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem('songbird-theme')
    if (stored === 'light') return false
    if (stored === 'dark') return true
    return true
  })
  const [route, setRoute] = useState(() => getRoute(window.location.pathname))
  const [user, setUser] = useState(null)
  const [authStatus, setAuthStatus] = useState('')
  const [authChecked, setAuthChecked] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)

  function applyTheme(nextIsDark) {
    const root = document.documentElement
    root.classList.add('theme-switching')
    if (nextIsDark) {
      root.classList.add('dark')
      localStorage.setItem('songbird-theme', 'dark')
    } else {
      root.classList.remove('dark')
      localStorage.setItem('songbird-theme', 'light')
    }

    const themeColor = nextIsDark ? '#020617' : '#ecfdf5'
    document.documentElement.style.backgroundColor = themeColor
    document.body.style.backgroundColor = themeColor

    let themeColorMeta = document.querySelector('meta[name="theme-color"]')
    if (!themeColorMeta) {
      themeColorMeta = document.createElement('meta')
      themeColorMeta.setAttribute('name', 'theme-color')
      document.head.appendChild(themeColorMeta)
    }
    themeColorMeta.setAttribute('content', themeColor)
    window.setTimeout(() => {
      root.classList.remove('theme-switching')
    }, 120)
  }

  function toggleTheme() {
    setIsDark((prev) => !prev)
  }

  useEffect(() => {
    applyTheme(isDark)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark])

  useEffect(() => {
    const root = document.documentElement
    const viewport = window.visualViewport
    if (!viewport) {
      root.style.setProperty('--app-height', `${window.innerHeight}px`)
      root.style.setProperty('--vv-bottom-offset', '0px')
      root.style.setProperty('--mobile-bottom-offset', '0px')
      return
    }

    const updateViewportOffset = () => {
      const appHeight = Math.max(320, Math.round(viewport.height))
      const offset = Math.max(0, Math.round(window.innerHeight - (viewport.height + viewport.offsetTop)))
      root.style.setProperty('--app-height', `${appHeight}px`)
      root.style.setProperty('--vv-bottom-offset', `${offset}px`)
      root.style.setProperty('--mobile-bottom-offset', `${offset}px`)
    }

    updateViewportOffset()
    viewport.addEventListener('resize', updateViewportOffset)
    viewport.addEventListener('scroll', updateViewportOffset)
    window.addEventListener('orientationchange', updateViewportOffset)

    return () => {
      viewport.removeEventListener('resize', updateViewportOffset)
      viewport.removeEventListener('scroll', updateViewportOffset)
      window.removeEventListener('orientationchange', updateViewportOffset)
    }
  }, [])

  useEffect(() => {
    let isMounted = true
    const fetchSession = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/me`, { credentials: 'include' })
        if (!res.ok) {
          throw new Error('No active session')
        }
        const data = await res.json()
        if (isMounted && data?.username) {
          setUser({
            id: data.id,
            username: data.username,
            nickname: data.nickname || null,
            avatarUrl: data.avatarUrl || null,
            color: data.color || null,
            status: data.status || 'online',
          })
        }
      } catch (_) {
        if (isMounted) {
          setUser(null)
        }
      } finally {
        if (isMounted) {
          setAuthChecked(true)
        }
      }
    }
    fetchSession()
    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    const onPopState = () => setRoute(getRoute(window.location.pathname))
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    const nextRoute = getRoute(window.location.pathname)
    if (nextRoute !== route) {
      setRoute(nextRoute)
    }
  }, [route])

  useEffect(() => {
    if (authLoading) return
    if (!authChecked) return
    if (user && route !== 'chat') {
      navigate('/chat', true)
      return
    }

    if (!user && route === 'chat') {
      navigate('/login', true)
    }
  }, [user, route, authChecked, authLoading])

  function navigate(path, replace = false) {
    if (replace) {
      window.history.replaceState({}, '', path)
    } else {
      window.history.pushState({}, '', path)
    }
    setRoute(getRoute(path))
  }

  async function handleLogin(event) {
    event.preventDefault()
    setAuthStatus('')
    setAuthLoading(true)
    const form = event.currentTarget
    const formData = new FormData(form)
    const payload = {
      username: formData.get('username')?.toString() || '',
      password: formData.get('password')?.toString() || '',
    }

    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Unable to sign in.')
      }
      const nextUser = {
        id: data.id,
        username: data.username,
        nickname: data.nickname || null,
        avatarUrl: data.avatarUrl || null,
        color: data.color || null,
        status: data.status || 'online',
      }
      setUser(nextUser)
      navigate('/chat', true)
    } catch (err) {
      setAuthStatus(err.message)
    } finally {
      setAuthLoading(false)
    }
  }

  async function handleSignup(event) {
    event.preventDefault()
    setAuthStatus('')
    setAuthLoading(true)
    const form = event.currentTarget
    const formData = new FormData(form)
    const password = formData.get('password')?.toString() || ''
    const confirmPassword = formData.get('confirmPassword')?.toString() || ''

    if (password !== confirmPassword) {
      setAuthStatus('Passwords do not match.')
      setAuthLoading(false)
      return
    }

    const payload = {
      username: formData.get('username')?.toString() || '',
      nickname: formData.get('nickname')?.toString() || '',
      password,
    }

    try {
      const res = await fetch(`${API_BASE}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Unable to create account.')
      }
      const nextUser = {
        id: data.id,
        username: data.username,
        nickname: data.nickname || null,
        avatarUrl: data.avatarUrl || null,
        color: data.color || null,
        status: data.status || 'online',
      }
      setUser(nextUser)
      navigate('/chat', true)
    } catch (err) {
      setAuthStatus(err.message)
    } finally {
      setAuthLoading(false)
    }
  }

  const isAuthRoute = route === 'login' || route === 'signup'
  const appShellClass = isAuthRoute
    ? 'min-h-screen bg-gradient-to-b from-emerald-100 via-emerald-200 to-green-300 text-slate-900 transition-colors duration-300 dark:from-emerald-950 dark:via-slate-950 dark:to-slate-900 dark:text-slate-100'
    : 'min-h-screen bg-emerald-50 text-slate-900 transition-colors duration-300 dark:bg-slate-950 dark:text-slate-100'

  return (
    <div className={appShellClass}>
      <div className="relative min-h-screen overflow-hidden">
        {isAuthRoute ? (
          <>
            <div className="pointer-events-none absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-emerald-400/30 blur-[130px] dark:bg-emerald-500/20" />
            <div className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 translate-x-1/3 rounded-full bg-lime-400/40 blur-[120px] dark:bg-lime-500/20" />
          </>
        ) : null}

        <div
          className={
            isAuthRoute
              ? 'mx-auto flex min-h-screen w-full max-w-6xl flex-col overflow-y-auto px-4 pb-8 pt-6 sm:px-6 sm:pb-16 sm:pt-10'
              : 'flex min-h-screen w-full flex-col px-0 pb-0 pt-0'
          }
        >
          {isAuthRoute ? (
            <header className="flex flex-wrap items-center justify-center gap-3 text-center sm:gap-4">
              <div className="flex items-center gap-1 text-black dark:text-white">
                <div className="flex h-8 w-8 items-center justify-center sm:h-9 sm:w-9">
                  <SongBirdLogo />
                </div>
                <div>
                  <p className="font-display text-xl font-bold tracking-tight sm:text-2xl">Songbird</p>
                </div>
              </div>
            </header>
          ) : null}

          <main className={isAuthRoute ? 'mt-6 flex flex-1 items-center justify-center sm:mt-10' : 'flex flex-1'}>
            {route === 'login' && (
              <AuthPage
                mode="login"
                isDark={isDark}
                onToggleTheme={toggleTheme}
                onSubmit={handleLogin}
                onSwitchMode={() => {
                  setAuthStatus('')
                  navigate('/signup')
                }}
                status={authStatus}
                loading={authLoading}
                showSigningOverlay={authLoading}
              />
            )}
            {route === 'signup' && (
              <AuthPage
                mode="signup"
                isDark={isDark}
                onToggleTheme={toggleTheme}
                onSubmit={handleSignup}
                onSwitchMode={() => {
                  setAuthStatus('')
                  navigate('/login')
                }}
                status={authStatus}
                loading={authLoading}
                showSigningOverlay={false}
              />
            )}
            {route === 'chat' && user ? (
              <ChatPage user={user} setUser={setUser} isDark={isDark} setIsDark={setIsDark} toggleTheme={toggleTheme} />
            ) : null}
          </main>
        </div>
      </div>
    </div>
  )
}

function SongBirdLogo() {
  return <img src={logo} alt="Song Bird logo" className="h-8 w-8" />
}

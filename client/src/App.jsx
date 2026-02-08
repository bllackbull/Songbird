import { useEffect, useState } from 'react'
import logo from './assets/songbird-logo.svg'
import ChatPage from './pages/ChatPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import SignupPage from './pages/SignupPage.jsx'

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

  useEffect(() => {
    const root = document.documentElement
    if (isDark) {
      root.classList.add('dark')
      localStorage.setItem('songbird-theme', 'dark')
    } else {
      root.classList.remove('dark')
      localStorage.setItem('songbird-theme', 'light')
    }
  }, [isDark])

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
    if (!authChecked) return
    if (user && route !== 'chat') {
      navigate('/chat', true)
      return
    }

    if (!user && route === 'chat') {
      navigate('/login', true)
    }
  }, [user, route, authChecked])

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
        status: data.status || 'online',
      }
      setUser(nextUser)
      navigate('/chat')
    } catch (err) {
      setAuthStatus(err.message)
    }
  }

  async function handleSignup(event) {
    event.preventDefault()
    setAuthStatus('')
    const form = event.currentTarget
    const formData = new FormData(form)
    const password = formData.get('password')?.toString() || ''
    const confirmPassword = formData.get('confirmPassword')?.toString() || ''

    if (password !== confirmPassword) {
      setAuthStatus('Passwords do not match.')
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
        status: data.status || 'online',
      }
      setUser(nextUser)
      navigate('/chat')
    } catch (err) {
      setAuthStatus(err.message)
    }
  }

  const isAuthRoute = route === 'login' || route === 'signup'

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-100 via-emerald-200 to-green-300 text-slate-900 transition-colors duration-300 dark:from-emerald-950 dark:via-slate-950 dark:to-slate-900 dark:text-slate-100">
      <div className="relative min-h-screen overflow-hidden">
        <div className="pointer-events-none absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-emerald-400/30 blur-[130px] dark:bg-emerald-500/20" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 translate-x-1/3 rounded-full bg-lime-400/40 blur-[120px] dark:bg-lime-500/20" />

        <div
          className={
            isAuthRoute
              ? 'mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 pb-16 pt-10'
              : 'flex min-h-screen w-full flex-col px-0 pb-0 pt-0'
          }
        >
          {isAuthRoute ? (
            <header className="flex flex-wrap items-center justify-center gap-4 text-center">
              <div className="flex items-center gap-1 text-black dark:text-white">
                <div className="flex h-9 w-9 items-center justify-center">
                  <SongBirdLogo />
                </div>
                <div>
                  <p className="font-display text-2xl font-bold tracking-tight">Songbird</p>
                </div>
              </div>
            </header>
          ) : null}

          <main className={isAuthRoute ? 'mt-10 flex flex-1 items-center justify-center' : 'flex flex-1'}>
            {route === 'login' && (
              <LoginPage
                isDark={isDark}
                onToggleTheme={() => setIsDark((prev) => !prev)}
                onLogin={handleLogin}
                onGoSignup={() => {
                  setAuthStatus('')
                  navigate('/signup')
                }}
                status={authStatus}
              />
            )}
            {route === 'signup' && (
              <SignupPage
                isDark={isDark}
                onToggleTheme={() => setIsDark((prev) => !prev)}
                onSignup={handleSignup}
                onGoLogin={() => {
                  setAuthStatus('')
                  navigate('/login')
                }}
                status={authStatus}
              />
            )}
            {route === 'chat' && user ? (
              <ChatPage user={user} setUser={setUser} isDark={isDark} setIsDark={setIsDark} />
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

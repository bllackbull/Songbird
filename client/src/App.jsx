import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import logo from './assets/songbird-logo.svg'
import { APP_CONFIG } from './settings/appConfig.js'
import InstallBar from './components/pwa/InstallBar.jsx'
import InstallGuideModal from './components/pwa/InstallGuideModal.jsx'

const API_BASE = ''
const AUTH_REDIRECT_KEY = 'songbird-auth-redirect'
const OPEN_CHAT_ID_KEY = 'songbird-open-chat-id'
const PWA_INSTALL_DISMISS_KEY = 'songbird-pwa-install-dismissed'
const PWA_PERMISSIONS_PROMPT_KEY = 'songbird-pwa-permissions-prompt'
const ROUTE_CHUNK_TELEMETRY_KEY = 'songbird-route-chunk-telemetry-v1'
const CHUNK_RECOVERY_ATTEMPT_KEY = 'songbird-chunk-recovery-attempted'
const loadAuthPage = () => import('./pages/AuthPage.jsx')
const loadChatPage = () => import('./pages/ChatPage.jsx')
const loadInvitePage = () => import('./pages/InvitePage.jsx')
const AuthPage = lazy(loadAuthPage)
const ChatPage = lazy(loadChatPage)
const InvitePage = lazy(loadInvitePage)

function getPreloadMode() {
  if (typeof navigator === 'undefined') return 'eager'
  const connection =
    navigator.connection || navigator.mozConnection || navigator.webkitConnection
  if (!connection) return 'eager'
  if (connection.saveData) return 'idle'
  const effectiveType = String(connection.effectiveType || '').toLowerCase()
  if (effectiveType === 'slow-2g' || effectiveType === '2g') return 'idle'
  return 'eager'
}

function RouteLoadingFallback({ themeColor, onVisibleChange = null }) {
  const [dots, setDots] = useState(0)
  useEffect(() => {
    onVisibleChange?.(true)
    const timer = window.setInterval(() => {
      setDots((prev) => (prev + 1) % 4)
    }, 180)
    return () => {
      window.clearInterval(timer)
      onVisibleChange?.(false)
    }
  }, [onVisibleChange])

  const content = (
    <div
      className="fixed inset-0 z-[1200] flex min-h-screen w-full items-center justify-center"
      style={{ backgroundColor: themeColor }}
    >
      <div className="flex flex-col items-center gap-3 text-center text-emerald-700 dark:text-emerald-300">
        <img src={logo} alt="Songbird logo" className="h-10 w-10 animate-pulse" />
        <p className="text-xs font-semibold tracking-wide">{`Loading${'.'.repeat(dots)}`}</p>
      </div>
    </div>
  )
  if (typeof document === 'undefined' || !document.body) return content
  return createPortal(content, document.body)
}

function getRoute(pathname) {
  if (pathname === '/signup') return 'signup'
  if (pathname.startsWith('/invite/')) return 'invite'
  if (pathname === '/chat') return 'chat'
  return 'login'
}

function getInviteToken(pathname) {
  if (!pathname.startsWith('/invite/')) return ''
  return pathname.slice('/invite/'.length).trim()
}

function isChunkLoadFailure(error) {
  const text = String(error?.message || error || '')
  return (
    text.includes('Failed to fetch dynamically imported module') ||
    text.includes('Importing a module script failed') ||
    text.includes('error loading dynamically imported module') ||
    text.includes('Unable to preload CSS for')
  )
}

export default function App() {
  async function recoverFromStaleShell() {
    if (typeof window === 'undefined') return
    if (window.sessionStorage.getItem(CHUNK_RECOVERY_ATTEMPT_KEY) === '1') return
    window.sessionStorage.setItem(CHUNK_RECOVERY_ATTEMPT_KEY, '1')

    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        await Promise.all(
          registrations.map((registration) => registration.unregister()),
        )
      }
    } catch {
      // ignore cleanup failures
    }

    try {
      if (typeof window.caches?.keys === 'function') {
        const keys = await window.caches.keys()
        await Promise.all(
          keys
            .filter((key) => key.startsWith('songbird-'))
            .map((key) => window.caches.delete(key)),
        )
      }
    } catch {
      // ignore cleanup failures
    }

    window.location.reload()
  }

  const resolveAutoThemeIsDark = () => {
    try {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return true
      }
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    } catch {
      return true
    }
  }

  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem('songbird-theme')
    if (stored === 'light') return false
    if (stored === 'dark') return true
    return resolveAutoThemeIsDark()
  })
  const [route, setRoute] = useState(() => getRoute(window.location.pathname))
  const [inviteToken, setInviteToken] = useState(() =>
    getInviteToken(window.location.pathname),
  )
  const [user, setUser] = useState(null)
  const [authStatus, setAuthStatus] = useState('')
  const [authChecked, setAuthChecked] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  const accountCreationEnabled = APP_CONFIG.accountCreationEnabled
  const isStandaloneDisplay =
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    window.navigator?.standalone
  const isIOS = /iP(ad|hone|od)/i.test(navigator.userAgent)
  const isIOSFirefox = /FxiOS/i.test(navigator.userAgent)
  const isIOSSafari =
    isIOS &&
    /Safari/i.test(navigator.userAgent) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(navigator.userAgent)
  const [installPromptEvent, setInstallPromptEvent] = useState(null)
  const [showInstallBanner, setShowInstallBanner] = useState(false)
  const [installDismissed, setInstallDismissed] = useState(() => {
    return localStorage.getItem(PWA_INSTALL_DISMISS_KEY) === '1'
  })
  const [installForceHidden, setInstallForceHidden] = useState(false)
  const [showIosInstallBanner, setShowIosInstallBanner] = useState(() => {
    if (!isIOS || isStandaloneDisplay) return false
    return localStorage.getItem(PWA_INSTALL_DISMISS_KEY) !== '1'
  })
  const [showInstallGuide, setShowInstallGuide] = useState(false)
  const [routeChunkLoading, setRouteChunkLoading] = useState(false)
  const preloadedRoutesRef = useRef(new Set())
  const routeChunkLoadStartRef = useRef(0)
  const installBarRef = useRef(null)
  const [installBarHeight, setInstallBarHeight] = useState(0)
  const themeRefreshTimersRef = useRef([])
  const isDesktopViewport =
    window.matchMedia?.('(min-width: 768px)')?.matches || false
  const showInstallBar =
    !isStandaloneDisplay &&
    !installDismissed &&
    (showInstallBanner || showIosInstallBanner || isDesktopViewport)

  function normalizeSessionUser(data) {
    if (!data?.username) return null
    return {
      id: data.id,
      username: data.username,
      nickname: data.nickname || null,
      avatarUrl: data.avatarUrl || null,
      color: data.color || null,
      status: data.status || 'online',
    }
  }

  async function fetchSessionUser() {
    const res = await fetch(`${API_BASE}/api/me`, { credentials: 'include' })
    if (!res.ok) {
      throw new Error('No active session')
    }
    const data = await res.json()
    const nextUser = normalizeSessionUser(data)
    if (!nextUser) {
      throw new Error('Invalid session payload')
    }
    return nextUser
  }

  async function resolveSessionUserWithRetry(fallbackUser = null, attempts = 8, waitMs = 150) {
    for (let i = 0; i < attempts; i += 1) {
      try {
        return await fetchSessionUser()
      } catch {
        if (i < attempts - 1) {
          await new Promise((resolve) => window.setTimeout(resolve, waitMs))
        }
      }
    }
    return fallbackUser
  }

  function clearThemeRefreshTimers() {
    themeRefreshTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    themeRefreshTimersRef.current = []
  }

  function ensureThemeColorMeta() {
    let meta = document.querySelector('meta[name="theme-color"]:not([media])')
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'theme-color')
      document.head.appendChild(meta)
    }
    return meta
  }

  function commitThemeColor(color) {
    document.documentElement.style.backgroundColor = color
    document.body.style.backgroundColor = color
    const meta = ensureThemeColorMeta()
    meta.setAttribute('content', color)
    const mediaThemeMetas = document.querySelectorAll('meta[name="theme-color"][media]')
    mediaThemeMetas.forEach((node) => node.setAttribute('content', color))
  }

  function refreshThemeColorForSafari(color, allowScrollNudge = true) {
    clearThemeRefreshTimers()
    const nudgeColor = color === '#ffffff' ? '#fefefe' : '#0e1728'
    commitThemeColor(nudgeColor)
    window.requestAnimationFrame(() => commitThemeColor(color))

    // Safari sometimes ignores same-value updates for bottom browser chrome.
    ;[40, 120, 240, 420, 700, 1100, 1600].forEach((delay) => {
      const timer = window.setTimeout(() => {
        const current = document.querySelector('meta[name="theme-color"]:not([media])')
        if (current?.parentNode) {
          const replacement = current.cloneNode(true)
          replacement.setAttribute('content', color)
          current.parentNode.replaceChild(replacement, current)
        } else {
          ensureThemeColorMeta().setAttribute('content', color)
        }
        commitThemeColor(color)
      }, delay)
      themeRefreshTimersRef.current.push(timer)
    })

    // Force Safari toolbar/theme-color recalc without waiting for manual touch.
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent)
    if (isIOS && allowScrollNudge) {
      const y = window.scrollY || 0
      try {
        window.scrollTo(0, y + 1)
        window.scrollTo(0, y)
      } catch {
        // ignore
      }
    }
  }

  function getThemeColor(nextIsDark, nextRoute = route) {
    const onChatRoute = nextRoute === 'chat'
    if (nextIsDark) {
      return onChatRoute ? '#0f172a' : '#020617'
    }
    return '#ffffff'
  }

  function applyTheme(nextIsDark, nextRoute = route) {
    const root = document.documentElement
    root.classList.add('theme-switching')
    if (nextIsDark) {
      root.classList.add('dark')
      localStorage.setItem('songbird-theme', 'dark')
    } else {
      root.classList.remove('dark')
      localStorage.setItem('songbird-theme', 'light')
    }
    root.style.colorScheme = nextIsDark ? 'dark' : 'light'

    const themeColor = getThemeColor(nextIsDark, nextRoute)
    document.documentElement.style.setProperty('--safe-area-theme-color', themeColor)
    refreshThemeColorForSafari(themeColor, nextRoute !== 'chat')
    ;['safe-area-top-fill', 'safe-area-bottom-fill'].forEach((id) => {
      const el = document.getElementById(id)
      if (el) {
        el.style.backgroundColor = themeColor
      }
    })

    window.setTimeout(() => {
      root.classList.remove('theme-switching')
    }, 120)
  }

  function toggleTheme() {
    setIsDark((prev) => {
      const next = !prev
      applyTheme(next, route)
      return next
    })
  }

  useEffect(() => {
    applyTheme(isDark, route)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark, route])

  useEffect(() => {
    if (route === 'signup' && !accountCreationEnabled) {
      navigate('/login', true)
    }
  }, [route, accountCreationEnabled])

  useEffect(() => {
    const refreshTheme = () => applyTheme(isDark, route)
    window.addEventListener('pageshow', refreshTheme)
    window.addEventListener('focus', refreshTheme)
    window.addEventListener('resize', refreshTheme)
    window.addEventListener('orientationchange', refreshTheme)
    document.addEventListener('visibilitychange', refreshTheme)
    return () => {
      window.removeEventListener('pageshow', refreshTheme)
      window.removeEventListener('focus', refreshTheme)
      window.removeEventListener('resize', refreshTheme)
      window.removeEventListener('orientationchange', refreshTheme)
      document.removeEventListener('visibilitychange', refreshTheme)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark, route])

  useEffect(() => {
    return () => {
      clearThemeRefreshTimers()
    }
  }, [])

  useEffect(() => {
    window.sessionStorage.removeItem(CHUNK_RECOVERY_ATTEMPT_KEY)
  }, [])

  useEffect(() => {
    const handleError = (event) => {
      if (!isChunkLoadFailure(event?.error || event?.message)) return
      event.preventDefault?.()
      void recoverFromStaleShell()
    }

    const handleRejection = (event) => {
      if (!isChunkLoadFailure(event?.reason)) return
      event.preventDefault?.()
      void recoverFromStaleShell()
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleRejection)
    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleRejection)
    }
  }, [])

  useEffect(() => {
    if (isStandaloneDisplay) return
    const dismissed = localStorage.getItem(PWA_INSTALL_DISMISS_KEY) === '1'
    if (dismissed) return
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault()
      setInstallPromptEvent(event)
      setShowInstallBanner(true)
    }
    const handleInstalled = () => {
      setInstallPromptEvent(null)
      setShowInstallBanner(false)
      setShowIosInstallBanner(false)
      setInstallDismissed(true)
      localStorage.setItem(PWA_INSTALL_DISMISS_KEY, '1')
      localStorage.setItem(PWA_PERMISSIONS_PROMPT_KEY, 'pending')
    }
    const handleHideInstall = () => setInstallForceHidden(true)
    const handleShowInstall = () => setInstallForceHidden(false)
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
    window.addEventListener('songbird-hide-install-bar', handleHideInstall)
    window.addEventListener('songbird-show-install-bar', handleShowInstall)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
      window.removeEventListener('songbird-hide-install-bar', handleHideInstall)
      window.removeEventListener('songbird-show-install-bar', handleShowInstall)
    }
  }, [isStandaloneDisplay])

  useEffect(() => {
    if (!APP_CONFIG.debugEnabled) {
      routeChunkLoadStartRef.current = 0
      return
    }
    if (routeChunkLoading) {
      routeChunkLoadStartRef.current = performance.now()
      return
    }
    const startedAt = Number(routeChunkLoadStartRef.current || 0)
    if (!startedAt) return
    routeChunkLoadStartRef.current = 0
    const durationMs = Math.max(0, performance.now() - startedAt)
    if (durationMs < 20) return
    try {
      const raw = localStorage.getItem(ROUTE_CHUNK_TELEMETRY_KEY)
      const parsed = JSON.parse(raw || '[]')
      const items = Array.isArray(parsed) ? parsed : []
      items.push({
        t: Date.now(),
        route,
        durationMs: Math.round(durationMs),
      })
      localStorage.setItem(
        ROUTE_CHUNK_TELEMETRY_KEY,
        JSON.stringify(items.slice(-80)),
      )
    } catch {
      // ignore telemetry storage failures
    }
  }, [route, routeChunkLoading])

  useEffect(() => {
    let cancelled = false
    let idleId = null
    let timerId = null
    const mode = getPreloadMode()

    const preloadKey = (key, loader) => {
      if (preloadedRoutesRef.current.has(key)) return
      preloadedRoutesRef.current.add(key)
      void loader().catch(() => {
        preloadedRoutesRef.current.delete(key)
      })
    }

    const preloadLikelyRoutes = () => {
      if (cancelled) return
      if (route === 'login' || route === 'signup') {
        preloadKey('chat', loadChatPage)
        return
      }
      if (route === 'invite') {
        preloadKey('chat', loadChatPage)
        preloadKey('auth', loadAuthPage)
        return
      }
      if (route === 'chat') {
        preloadKey('invite', loadInvitePage)
        return
      }
      preloadKey('auth', loadAuthPage)
    }

    const warmupMarkdownRendering = () => {
      if (cancelled) return
      if (route !== 'chat') return
      void import('./utils/markdown.js')
        .then((mod) => {
          mod?.preloadMarkdownHighlighter?.()
        })
        .catch(() => {})
    }

    const triggerPreload = () => {
      preloadLikelyRoutes()
      warmupMarkdownRendering()
    }

    if (mode === 'eager') {
      timerId = window.setTimeout(triggerPreload, 80)
    } else if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(triggerPreload, { timeout: 1600 })
    } else {
      timerId = window.setTimeout(triggerPreload, 650)
    }

    window.addEventListener('pointerdown', triggerPreload, {
      once: true,
      passive: true,
      capture: true,
    })
    window.addEventListener('keydown', triggerPreload, {
      once: true,
      passive: true,
      capture: true,
    })

    return () => {
      cancelled = true
      if (timerId !== null) {
        window.clearTimeout(timerId)
      }
      if (
        idleId !== null &&
        typeof window.cancelIdleCallback === 'function'
      ) {
        window.cancelIdleCallback(idleId)
      }
      window.removeEventListener('pointerdown', triggerPreload, {
        capture: true,
      })
      window.removeEventListener('keydown', triggerPreload, {
        capture: true,
      })
    }
  }, [route])

  useLayoutEffect(() => {
    const barNode = installBarRef.current
    if (!barNode) {
      setInstallBarHeight(0)
      return
    }
    const measure = () => {
      const rect = barNode.getBoundingClientRect()
      setInstallBarHeight(Number(rect?.height || 0))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => measure())
    observer.observe(barNode)
    return () => observer.disconnect()
  }, [showInstallBanner, showIosInstallBanner])

  useEffect(() => {
    const root = document.documentElement
    const effectiveHeight =
      showInstallBar && !installForceHidden ? `${installBarHeight}px` : '0px'
    root.style.setProperty('--install-bar-height', effectiveHeight)
    root.style.setProperty(
      '--install-bar-opacity',
      showInstallBar && !installForceHidden ? '1' : '0',
    )
    root.style.setProperty(
      '--install-bar-pe',
      showInstallBar && !installForceHidden ? 'auto' : 'none',
    )
    root.style.setProperty(
      '--install-bar-translate',
      showInstallBar && !installForceHidden ? '0%' : '-110%',
    )
    root.style.setProperty(
      '--install-bar-z',
      routeChunkLoading ? '10' : '40',
    )
  }, [installBarHeight, installForceHidden, showInstallBar, routeChunkLoading])

  useEffect(() => {
    if (!isStandaloneDisplay) return
    if (typeof window === 'undefined') return
    const flag = localStorage.getItem(PWA_PERMISSIONS_PROMPT_KEY)
    if (flag !== 'pending') return
    localStorage.setItem(PWA_PERMISSIONS_PROMPT_KEY, 'done')
    const triggerPrompts = () => {
      if (typeof Notification !== 'undefined') {
        try {
          if (
            typeof Notification.requestPermission === 'function' &&
            Notification.permission === 'default'
          ) {
            Notification.requestPermission().catch(() => {})
          }
        } catch {
          // ignore
        }
      }
      if (navigator.mediaDevices?.getUserMedia) {
        navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((stream) => {
            stream?.getTracks?.().forEach((track) => track.stop())
          })
          .catch(() => {})
      }
    }
    const timer = window.setTimeout(triggerPrompts, 600)
    return () => window.clearTimeout(timer)
  }, [isStandaloneDisplay])

  useEffect(() => {
    const root = document.documentElement
    if (isIOSFirefox) {
      root.style.setProperty('--vv-bottom-offset', '0px')
      root.style.setProperty('--mobile-bottom-offset', '0px')
      root.style.setProperty('--vv-top-offset', '0px')
      return
    }
    const viewport = window.visualViewport
    if (!viewport) {
      root.style.setProperty('--vv-bottom-offset', '0px')
      root.style.setProperty('--mobile-bottom-offset', '0px')
      root.style.setProperty('--vv-top-offset', '0px')
      return
    }

    const updateViewportOffset = () => {
      const topOffset = Math.max(0, Number(viewport.offsetTop || 0))
      const activeEl = document.activeElement
      const focusedEditable =
        !!activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.isContentEditable)
      const keyboardLikelyOpen =
        focusedEditable || window.innerHeight - viewport.height > 120
      // Do not react to Safari toolbar/bottom chrome movement while scrolling.
      // Only apply offset adjustments while an editable field is focused.
      const offset = focusedEditable && keyboardLikelyOpen ? 0 : 0
      root.style.setProperty('--vv-bottom-offset', `${offset}px`)
      root.style.setProperty('--mobile-bottom-offset', `${offset}px`)
      root.style.setProperty(
        '--vv-top-offset',
        `${focusedEditable && keyboardLikelyOpen ? topOffset : 0}px`,
      )
    }

    updateViewportOffset()
    viewport.addEventListener('resize', updateViewportOffset)
    window.addEventListener('orientationchange', updateViewportOffset)
    window.addEventListener('focusin', updateViewportOffset)
    window.addEventListener('focusout', updateViewportOffset)

    return () => {
      viewport.removeEventListener('resize', updateViewportOffset)
      window.removeEventListener('orientationchange', updateViewportOffset)
      window.removeEventListener('focusin', updateViewportOffset)
      window.removeEventListener('focusout', updateViewportOffset)
    }
  }, [isIOSFirefox])


  useEffect(() => {
    let isMounted = true
    const fetchSession = async () => {
      try {
        const nextUser = await fetchSessionUser()
        if (isMounted && nextUser) {
          setUser(nextUser)
        }
      } catch {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setInviteToken(getInviteToken(window.location.pathname))
  }, [route])

  useEffect(() => {
    if (authLoading) return
    if (!authChecked) return
    if (user && (route === 'login' || route === 'signup')) {
      navigate('/chat', true)
      return
    }

    if (!user && (route === 'chat' || route === 'invite')) {
      if (route === 'invite') {
        const nextPath = window.location.pathname
        if (nextPath.startsWith('/invite/')) {
          window.sessionStorage.setItem(AUTH_REDIRECT_KEY, nextPath)
        }
      }
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
    setInviteToken(getInviteToken(path))
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
      let data = {}
      const contentType = res.headers.get('content-type')
      if (contentType && contentType.includes('application/json')) {
        try {
          data = await res.json()
        } catch {
          data = {}
        }
      }
      if (!res.ok) {
        throw new Error(data?.error || 'Unable to sign in.')
      }
      const fallbackUser = {
        id: data.id,
        username: data.username,
        nickname: data.nickname || null,
        avatarUrl: data.avatarUrl || null,
        color: data.color || null,
        status: data.status || 'online',
      }
      const nextUser = await resolveSessionUserWithRetry(fallbackUser)
      setUser(nextUser)
      const redirectPath = window.sessionStorage.getItem(AUTH_REDIRECT_KEY)
      if (redirectPath && redirectPath.startsWith('/invite/')) {
        window.sessionStorage.removeItem(AUTH_REDIRECT_KEY)
        navigate(redirectPath, true)
      } else {
        navigate('/chat', true)
      }
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
      const registerRes = await fetch(`${API_BASE}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      })
      let registerData = {}
      const contentType = registerRes.headers.get('content-type')
      if (contentType && contentType.includes('application/json')) {
        try {
          registerData = await registerRes.json()
        } catch {
          registerData = {}
        }
      }
      if (!registerRes.ok) {
        throw new Error(registerData?.error || 'Unable to create account.')
      }
      // Signup creates the account only; user must explicitly sign in next.
      setUser(null)
      setAuthStatus('')
      navigate('/login', true)
    } catch (err) {
      setAuthStatus(err.message)
    } finally {
      setAuthLoading(false)
    }
  }

  const isAuthRoute = route === 'login' || route === 'signup' || route === 'invite'
  const safeAreaKey = `${route}-${isDark ? 'dark' : 'light'}`
  const safeAreaThemeColor = getThemeColor(isDark, route)
  const appShellClass = isAuthRoute
    ? 'min-h-screen bg-gradient-to-b from-white via-emerald-50/70 to-white text-slate-900 transition-colors duration-300 dark:bg-gradient-to-b dark:from-emerald-950 dark:via-slate-950 dark:to-slate-900 dark:text-slate-100'
    : 'h-[100dvh] bg-white text-slate-900 transition-colors duration-300 dark:bg-slate-950 dark:text-slate-100'

  const appContainerStyle = {
    paddingTop: 'var(--install-bar-height, 0px)',
    transition: 'padding-top 220ms ease',
  }
  const authViewportStyle = isAuthRoute
    ? {
        minHeight: 'calc(100dvh - var(--install-bar-height, 0px))',
        height: 'calc(100dvh - var(--install-bar-height, 0px))',
      }
    : undefined
  const authContentStyle = isAuthRoute
    ? {
        minHeight: 'calc(100dvh - var(--install-bar-height, 0px))',
      }
    : undefined

  return (
    <div className={appShellClass} style={appContainerStyle}>
      <div
        className={
          isAuthRoute
            ? 'relative min-h-screen app-scroll overflow-y-auto'
            : 'relative h-full min-h-0 overflow-hidden'
        }
        style={authViewportStyle}
      >
        {!isAuthRoute ? (
          <>
            {isIOSSafari ? (
              <div
                id="safe-area-bottom-ios-mask"
                key={`ios-mask-${safeAreaKey}`}
                className="pointer-events-none fixed inset-x-0 bottom-0 z-0 md:hidden"
                style={{
                  height: 'max(76px, calc(env(safe-area-inset-bottom) + var(--vv-bottom-offset, 0px) + 76px))',
                  backgroundColor: safeAreaThemeColor,
                }}
              />
            ) : null}
            <div
              id="safe-area-top-fill"
              key={`top-${safeAreaKey}`}
              className="pointer-events-none fixed inset-x-0 top-0 z-30"
              style={{
                height: 'calc(env(safe-area-inset-top) + 1px)',
                backgroundColor: safeAreaThemeColor,
              }}
            />
            <div
              id="safe-area-bottom-fill"
              key={`bottom-${safeAreaKey}`}
              className="pointer-events-none fixed inset-x-0 bottom-0 z-30"
              style={{
                height: 'calc(env(safe-area-inset-bottom) + var(--vv-bottom-offset, 0px) + 1px)',
                backgroundColor: safeAreaThemeColor,
              }}
            />
            <div
              id="safe-area-bottom-cover"
              key={`cover-${safeAreaKey}`}
              className="pointer-events-none fixed inset-x-0 bottom-0 z-0 md:hidden"
              style={{
                height: 'max(76px, calc(env(safe-area-inset-bottom) + var(--vv-bottom-offset, 0px) + 76px))',
                backgroundColor: safeAreaThemeColor,
              }}
            />
          </>
        ) : null}
        {isAuthRoute ? (
          <>
            <div className="pointer-events-none fixed -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-emerald-400/30 blur-[130px]" />
            <div className="pointer-events-none fixed bottom-0 right-0 h-80 w-80 translate-x-1/3 rounded-full bg-lime-400/40 blur-[120px]" />
          </>
        ) : null}

        <div
          className={
            isAuthRoute
              ? 'mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 pb-8 pt-6 sm:px-6 sm:pb-16 sm:pt-10'
              : 'relative flex h-full min-h-0 w-full flex-col px-0 pb-0 pt-0'
          }
          style={{
            ...(authContentStyle || {}),
            zIndex: routeChunkLoading ? '70' : 'var(--app-z, 20)',
          }}
        >
          {isAuthRoute ? (
            <header className="flex flex-wrap items-center justify-center gap-3 text-center sm:gap-4">
              <div className="flex items-center gap-1 text-black dark:text-white">
                <div className="flex h-8 w-8 items-center justify-center sm:h-9 sm:w-9">
                  <img src={logo} alt="Songbird logo" className="h-8 w-8" />
                </div>
                <div>
                  <p className="text-xl font-bold tracking-tight sm:text-2xl">Songbird</p>
                </div>
              </div>
            </header>
          ) : null}

          <main className={isAuthRoute ? 'flex flex-1 items-center justify-center px-1 py-6 sm:mt-0 sm:px-0 sm:py-8' : 'flex min-h-0 flex-1'}>
            <Suspense
              fallback={
                <RouteLoadingFallback
                  themeColor={safeAreaThemeColor}
                  onVisibleChange={setRouteChunkLoading}
                />
              }
            >
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
                  allowSignup={accountCreationEnabled}
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
                  allowSignup={accountCreationEnabled}
                />
              )}
              {route === 'chat' && user ? (
                <ChatPage user={user} setUser={setUser} isDark={isDark} setIsDark={setIsDark} toggleTheme={toggleTheme} />
              ) : null}
              {route === 'invite' && user ? (
                <InvitePage
                  token={inviteToken}
                  user={user}
                  isDark={isDark}
                  onToggleTheme={toggleTheme}
                  onNavigateChat={(chatId = 0) => {
                    const nextChatId = Number(chatId || 0)
                    if (nextChatId > 0) {
                      window.sessionStorage.setItem(OPEN_CHAT_ID_KEY, String(nextChatId))
                    }
                    navigate('/chat', true)
                  }}
                  onRequireLogin={() => navigate('/login', true)}
                />
              ) : null}
            </Suspense>
          </main>
        </div>
      </div>

      <InstallBar
        ref={installBarRef}
        show={showInstallBar}
        iconSrc="/icons/icon-192.png"
        onDismiss={() => {
          setShowInstallBanner(false)
          setShowIosInstallBanner(false)
          setInstallDismissed(true)
          localStorage.setItem(PWA_INSTALL_DISMISS_KEY, '1')
        }}
        onInstall={async () => {
          if (installPromptEvent) {
            try {
              if (typeof installPromptEvent.prompt !== 'function') {
                throw new Error('Install prompt unavailable')
              }
              await installPromptEvent.prompt()
              const choice = await installPromptEvent.userChoice
              if (choice?.outcome !== 'accepted') {
                setInstallDismissed(true)
                localStorage.setItem(PWA_INSTALL_DISMISS_KEY, '1')
              }
            } catch {
              setShowInstallGuide(true)
            } finally {
              setInstallPromptEvent(null)
              setShowInstallBanner(false)
            }
            return
          }
          setShowInstallGuide(true)
        }}
      />

      <InstallGuideModal
        open={showInstallGuide}
        iconSrc="/icons/icon-192.png"
        isDesktop={isDesktopViewport}
        onClose={() => setShowInstallGuide(false)}
      />
    </div>
  )
}

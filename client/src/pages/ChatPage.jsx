import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ChatIcon,
  CloseIcon,
  CheckIcon,
  LogoutIcon,
  MinusIcon,
  MoonIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  SendIcon,
  SettingsIcon,
  SunIcon,
  UserIcon,
  ShieldIcon,
  UploadIcon,
  BackIcon,
} from '../components/Icons.jsx'

const API_BASE = ''

export default function ChatPage({ user, setUser, isDark, setIsDark }) {
  const [status, setStatus] = useState('')
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [conversations, setConversations] = useState([])
  const [activeConversationId, setActiveConversationId] = useState(null)
  const [messages, setMessages] = useState([])
  const [showSettings, setShowSettings] = useState(false)
  const [mobileTab, setMobileTab] = useState('chats')
  const [settingsPanel, setSettingsPanel] = useState(null)
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [newChatUsername, setNewChatUsername] = useState('')
  const [newChatError, setNewChatError] = useState('')
  const [newChatResults, setNewChatResults] = useState([])
  const [newChatLoading, setNewChatLoading] = useState(false)
  const [newChatSelection, setNewChatSelection] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [selectedChats, setSelectedChats] = useState([])
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [pendingDeleteIds, setPendingDeleteIds] = useState([])
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [userScrolledUp, setUserScrolledUp] = useState(false)
  const [unreadInChat, setUnreadInChat] = useState(0)
  const [unreadMarkerId, setUnreadMarkerId] = useState(null)
  const chatScrollRef = useRef(null)
  const lastMessageIdRef = useRef(null)
  const isAtBottomRef = useRef(true)
  const userScrolledUpRef = useRef(false)
  const pendingScrollToBottomRef = useRef(false)
  const pendingScrollToUnreadRef = useRef(null)
  const unreadMarkerIdRef = useRef(null)
  const shouldAutoMarkReadRef = useRef(true)
  const openingConversationRef = useRef(false)
  const [profileForm, setProfileForm] = useState({
    nickname: user?.nickname || '',
    username: user?.username || '',
    avatarUrl: user?.avatarUrl || '',
  })
  const [avatarPreview, setAvatarPreview] = useState(user?.avatarUrl || '')
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [statusSelection, setStatusSelection] = useState(user?.status || 'online')
  const [isConnected, setIsConnected] = useState(false)
  const [activePeer, setActivePeer] = useState(null)
  const [peerPresence, setPeerPresence] = useState({ status: 'offline', lastSeen: null })

  const settingsMenuRef = useRef(null)
  const settingsButtonRef = useRef(null)

  useEffect(() => {
    if (user) {
      setProfileForm({
        nickname: user.nickname || '',
        username: user.username || '',
        avatarUrl: user.avatarUrl || '',
      })
      setAvatarPreview(user.avatarUrl || '')
      setStatusSelection(user.status === 'idle' ? 'online' : user.status || 'online')
    }
  }, [user])

  useEffect(() => {
    if (user) {
      void loadConversations()
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    const interval = setInterval(() => {
      void loadConversations({ silent: true })
    }, 5000)
    return () => clearInterval(interval)
  }, [user])

  useEffect(() => {
    if (!user) return
    const ping = async () => {
      try {
        await fetch(`${API_BASE}/api/presence`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: user.username }),
        })
      } catch (_) {
        // ignore
      }
    }
    ping()
    const interval = setInterval(ping, 20000)
    return () => clearInterval(interval)
  }, [user])

  useEffect(() => {
    if (!newChatOpen) return
    if (!newChatUsername.trim()) {
      setNewChatResults([])
      setNewChatSelection(null)
      return
    }
    const handle = setTimeout(async () => {
      try {
        setNewChatLoading(true)
        const res = await fetch(
          `${API_BASE}/api/users?exclude=${encodeURIComponent(user.username)}&query=${encodeURIComponent(
            newChatUsername.trim().toLowerCase()
          )}`
        )
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data?.error || 'Unable to search users.')
        }
        const users = data.users || []
        setNewChatResults(users)
      } catch (err) {
        setNewChatError(err.message)
      } finally {
        setNewChatLoading(false)
      }
    }, 300)
    return () => clearTimeout(handle)
  }, [newChatUsername, newChatOpen, user.username])

  useEffect(() => {
    let isMounted = true
    const checkHealth = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/health`)
        if (!res.ok) throw new Error('Not connected')
        const data = await res.json()
        if (isMounted) {
          setIsConnected(Boolean(data?.ok))
        }
      } catch (_) {
        if (isMounted) {
          setIsConnected(false)
        }
      }
    }
    checkHealth()
    const interval = setInterval(checkHealth, 8000)
    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    if (user && activeConversationId) {
      isAtBottomRef.current = true
      setIsAtBottom(true)
      setLoadingMessages(true)
      setMessages([])
      lastMessageIdRef.current = null
      setUnreadInChat(0)
      userScrolledUpRef.current = false
      setUserScrolledUp(false)
      setUnreadMarkerId(null)
      unreadMarkerIdRef.current = null
      pendingScrollToUnreadRef.current = null
      shouldAutoMarkReadRef.current = true
      openingConversationRef.current = true
      pendingScrollToBottomRef.current = true
      void loadMessages(Number(activeConversationId), { initialLoad: true })
    }
  }, [user, activeConversationId])

  useEffect(() => {
    if (!activeConversationId) {
      setUnreadInChat(0)
    }
  }, [activeConversationId])

  const activeId = activeConversationId ? Number(activeConversationId) : null
  const visibleConversations = conversations
  const activeConversation =
    visibleConversations.find((conv) => conv.id === activeId) ||
    conversations.find((conv) => conv.id === activeId)
  const activeMembers = activeConversation?.members || []
  const activeDmMember =
    activeConversation?.type === 'dm'
      ? activeMembers.find((member) => member.username !== user.username)
      : null
  const activeHeaderPeer = activePeer || activeDmMember
  const activeTitle = useMemo(() => {
    if (!activeConversation) return 'Select a chat'
    if (activeConversation.type === 'dm') {
      return activeDmMember?.nickname || activeDmMember?.username || 'Direct message'
    }
    return activeConversation.name || 'Chat'
  }, [activeConversation, activeDmMember, user.username])
  const activeFallbackTitle =
    activeHeaderPeer?.nickname || activeHeaderPeer?.username || 'Select a chat'
  const canStartChat = Boolean(newChatSelection)

  const displayName = user.nickname || user.username
  const statusValueRaw = user.status || 'online'
  const statusValue = statusValueRaw === 'idle' ? 'online' : statusValueRaw
  const statusDotClass =
    statusValue === 'invisible' ? 'bg-slate-400' : statusValue === 'online' ? 'bg-emerald-400' : ''

  const lastSeenAt = peerPresence.lastSeen ? new Date(peerPresence.lastSeen).getTime() : null
  const peerIdleThreshold = 90 * 1000
  const peerIsOffline =
    !activeHeaderPeer ||
    peerPresence.status === 'invisible' ||
    (lastSeenAt !== null && Date.now() - lastSeenAt > peerIdleThreshold)
  const peerStatusLabel = peerIsOffline ? 'offline' : peerPresence.status === 'invisible' ? 'invisible' : 'online'

  const toggleSelectChat = (chatId) => {
    setSelectedChats((prev) =>
      prev.includes(chatId) ? prev.filter((id) => id !== chatId) : [...prev, chatId]
    )
  }

  const requestDeleteChats = (ids) => {
    if (!ids.length) return
    setPendingDeleteIds(ids)
    setConfirmDeleteOpen(true)
  }

  const confirmDeleteChats = async () => {
    const idsToHide = pendingDeleteIds.length ? pendingDeleteIds : selectedChats
    if (!idsToHide.length) return
    try {
      await fetch(`${API_BASE}/api/chats/hide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, conversationIds: idsToHide }),
      })
    } catch (_) {
      // ignore
    }
    if (idsToHide.includes(activeId)) {
      // close with animation on mobile, then clear active
      setMobileTab('chats')
      setTimeout(() => {
        setActiveConversationId(null)
        setActivePeer(null)
      }, 340)
    }
    setSelectedChats([])
    setPendingDeleteIds([])
    setEditMode(false)
    setConfirmDeleteOpen(false)
    await loadConversations()
  }

  const parseServerDate = (value) => {
    if (!value) return new Date()
    if (typeof value === 'string') {
      const normalized = value.includes('T') ? value : value.replace(' ', 'T')
      return normalized.endsWith('Z') ? new Date(normalized) : new Date(`${normalized}Z`)
    }
    return new Date(value)
  }

  const formatDayLabel = (dateValue) => {
    const now = new Date()
    const date = parseServerDate(dateValue)
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const diffDays = Math.round((startOfToday - startOfDate) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays > 1 && diffDays < 7) {
      return date.toLocaleDateString(undefined, { weekday: 'long' })
    }
    return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
  }

  const formatTime = (dateValue) =>
    parseServerDate(dateValue).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })

  useEffect(() => {
    if (!user || !activeConversationId) return
    const interval = setInterval(() => {
      void loadMessages(Number(activeConversationId), { silent: true })
    }, 5000)
    return () => clearInterval(interval)
  }, [user, activeConversationId])

  // Helper to close conversation after mobile slide animation completes
  const closeConversation = () => {
    setMobileTab('chats')
    setTimeout(() => {
      setActiveConversationId(null)
      setActivePeer(null)
    }, 340)
  }

  useEffect(() => {
    if (!activeHeaderPeer?.username) return
    let isMounted = true
    const fetchPresence = async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/presence?username=${encodeURIComponent(activeHeaderPeer.username)}`
        )
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data?.error || 'Unable to fetch presence.')
        }
        if (isMounted) {
          setPeerPresence({ status: data.status || 'online', lastSeen: data.lastSeen || null })
        }
      } catch (_) {
        if (isMounted) {
          setPeerPresence({ status: 'offline', lastSeen: null })
        }
      }
    }
    fetchPresence()
    const interval = setInterval(fetchPresence, 5000)
    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [activeHeaderPeer?.username])

  useLayoutEffect(() => {
    if (!activeConversationId) return
    const container = chatScrollRef.current
    if (!container) return
    if (pendingScrollToUnreadRef.current) {
      const target = document.getElementById(`message-${pendingScrollToUnreadRef.current}`)
      if (target) {
        const top = target.offsetTop - container.offsetTop - 24
        container.scrollTop = Math.max(top, 0)
        pendingScrollToUnreadRef.current = null
      }
      return
    }
    const shouldScroll =
      pendingScrollToBottomRef.current || (!userScrolledUpRef.current && isAtBottomRef.current)
    if (!shouldScroll) return
    if (pendingScrollToBottomRef.current && loadingMessages && messages.length === 0) {
      return
    }
    container.scrollTop = container.scrollHeight
    pendingScrollToBottomRef.current = false
  }, [messages, activeConversationId, loadingMessages])

  useEffect(() => {
    if (!activeConversationId) return
    const conversationId = Number(activeConversationId)
    return () => {
      if (!conversationId || !user) return
      shouldAutoMarkReadRef.current = true
      setUnreadMarkerId(null)
      unreadMarkerIdRef.current = null
      pendingScrollToUnreadRef.current = null
      fetch(`${API_BASE}/api/messages/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, username: user.username }),
      }).catch(() => null)
    }
  }, [activeConversationId, user])

  useEffect(() => {
    if (!showSettings) return
    const handleOutside = (event) => {
      const target = event.target
      if (settingsMenuRef.current && settingsMenuRef.current.contains(target)) return
      if (settingsButtonRef.current && settingsButtonRef.current.contains(target)) return
      setShowSettings(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [showSettings])


  async function loadConversations(options = {}) {
    try {
      const res = await fetch(
        `${API_BASE}/api/conversations?username=${encodeURIComponent(user.username)}`
      )
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to load conversations.')
      }
      const list = (data.conversations || []).map((conv) => ({
        ...conv,
        id: Number(conv.id),
        members: (conv.members || []).map((member) => ({
          ...member,
          id: Number(member.id),
        })),
      }))
      list.sort((a, b) => {
        const aTime = a.last_time ? parseServerDate(a.last_time).getTime() : 0
        const bTime = b.last_time ? parseServerDate(b.last_time).getTime() : 0
        return bTime - aTime
      })
      setConversations(list)
    } catch (err) {
      if (!options.silent) {
        setStatus(err.message)
      }
    }
  }

  async function loadMessages(conversationId, options = {}) {
    if (!options.silent) {
      setLoadingMessages(true)
      setStatus('')
    }
    try {
      const res = await fetch(
        `${API_BASE}/api/messages?conversationId=${conversationId}&username=${encodeURIComponent(
          user.username
        )}`
      )
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to load messages.')
      }
      const nextMessages = data.messages || []
      setMessages((prev) => {
        if (prev.length === nextMessages.length) {
          const prevLast = prev[prev.length - 1]
          const nextLast = nextMessages[nextMessages.length - 1]
          if (prevLast?.id === nextLast?.id && prevLast?.read_at === nextLast?.read_at) {
            return prev
          }
        }
        return nextMessages
      })
      const lastMsg = nextMessages[nextMessages.length - 1]
      const lastId = lastMsg?.id || null
      const prevCount = messages.length
      const newCount = nextMessages.length - prevCount
      const hasNew = lastId && lastMessageIdRef.current && lastId !== lastMessageIdRef.current
      const newFromSelf = lastMsg?.username === user.username
      lastMessageIdRef.current = lastId

      if (openingConversationRef.current) {
        const firstUnread = nextMessages.find(
          (msg) => msg.username !== user.username && !msg.read_at
        )
        if (firstUnread) {
          setUnreadMarkerId(firstUnread.id)
          unreadMarkerIdRef.current = firstUnread.id
          pendingScrollToUnreadRef.current = firstUnread.id
          pendingScrollToBottomRef.current = false
          shouldAutoMarkReadRef.current = false
          userScrolledUpRef.current = true
          setUserScrolledUp(true)
          isAtBottomRef.current = false
          setIsAtBottom(false)
        } else {
          setUnreadMarkerId(null)
          unreadMarkerIdRef.current = null
          shouldAutoMarkReadRef.current = true
          pendingScrollToBottomRef.current = true
        }
        openingConversationRef.current = false
      }

      if (options.forceBottom) {
        pendingScrollToBottomRef.current = true
        isAtBottomRef.current = true
        setIsAtBottom(true)
        userScrolledUpRef.current = false
        setUserScrolledUp(false)
      }

      if (!options.silent) {
        setUnreadInChat(0)
      } else if (hasNew && userScrolledUpRef.current && !newFromSelf) {
        setUnreadInChat((prev) => prev + Math.max(newCount, 1))
      }

      if (newFromSelf) {
        pendingScrollToBottomRef.current = true
        isAtBottomRef.current = true
        setIsAtBottom(true)
        userScrolledUpRef.current = false
        setUserScrolledUp(false)
      }
      if (
        activeConversation?.type === 'dm' &&
        shouldAutoMarkReadRef.current &&
        (!userScrolledUpRef.current || newFromSelf)
      ) {
        await fetch(`${API_BASE}/api/messages/read`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId, username: user.username }),
        })
      }
    } catch (err) {
      setStatus(err.message)
    } finally {
      if (!options.silent) {
        setLoadingMessages(false)
      }
    }
  }

  async function handleSend(event) {
    event.preventDefault()
    if (!activeConversationId) return
    setStatus('')
    userScrolledUpRef.current = false
    setUserScrolledUp(false)
    isAtBottomRef.current = true
    setIsAtBottom(true)
    shouldAutoMarkReadRef.current = true
    setUnreadMarkerId(null)
    unreadMarkerIdRef.current = null
    const form = event.currentTarget
    const formData = new FormData(form)
    const body = formData.get('message')?.toString() || ''
    if (!body.trim()) return

    try {
      const res = await fetch(`${API_BASE}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username,
          body,
          conversationId: activeConversationId,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Unable to send message.')
      }
      form.reset()
      pendingScrollToBottomRef.current = true
      await loadMessages(activeConversationId, { forceBottom: true })
      await loadConversations()
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function startDirectMessage() {
    if (!newChatUsername.trim()) return
    setNewChatError('')
    try {
      if (!isConnected) {
        setNewChatError('Server not reachable.')
        return
      }
      const matched = newChatSelection
      if (!matched) {
        setNewChatError('Pick a user from the search results.')
        return
      }
      const target = matched.username
      const res = await fetch(`${API_BASE}/api/conversations/dm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: user.username, to: target }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || `Unable to start chat (${res.status}).`)
      }
      if (!data?.id) {
        throw new Error('Server did not return a chat id.')
      }
      setActiveConversationId(Number(data.id))
      setActivePeer(matched)
      setNewChatUsername('')
      setNewChatOpen(false)
      setMobileTab('chat')
      await loadConversations()
    } catch (err) {
      setNewChatError(err.message)
    }
  }

  async function updateStatus(nextStatus, markIdle) {
    if (!user || user.status === nextStatus) return
    try {
      const res = await fetch(`${API_BASE}/api/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, status: nextStatus }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Unable to update status.')
      }
      const nextUser = { ...user, status: data.status }
      setUser(nextUser)
    } catch (err) {
      setStatus(err.message)
    }
  }

  function handleAvatarChange(event) {
    const file = event.target.files?.[0]
    if (!file) {
      setProfileForm((prev) => ({ ...prev, avatarUrl: '' }))
      setAvatarPreview('')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      setProfileForm((prev) => ({ ...prev, avatarUrl: result }))
      setAvatarPreview(result)
    }
    reader.readAsDataURL(file)
  }

  async function handleProfileSave(event) {
    event.preventDefault()
    setStatus('')
    try {
      const res = await fetch(`${API_BASE}/api/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentUsername: user.username,
          username: profileForm.username,
          nickname: profileForm.nickname,
          avatarUrl: profileForm.avatarUrl,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Unable to update profile.')
      }
      const nextUser = {
        ...user,
        username: data.username,
        nickname: data.nickname,
        avatarUrl: data.avatarUrl,
        status: data.status,
      }
      let updatedUser = nextUser

      if (statusSelection && statusSelection !== (user.status || 'online')) {
        await updateStatus(statusSelection, false)
        updatedUser = { ...updatedUser, status: statusSelection }
      }

      setUser(updatedUser)
      setSettingsPanel(null)
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function handlePasswordSave(event) {
    event.preventDefault()
    setStatus('')
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setStatus('Passwords do not match.')
      return
    }
    try {
      const res = await fetch(`${API_BASE}/api/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username,
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Unable to update password.')
      }
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setSettingsPanel(null)
    } catch (err) {
      setStatus(err.message)
    }
  }

  function handleLogout() {
    fetch(`${API_BASE}/api/logout`, { method: 'POST', credentials: 'include' }).catch(() => null)
    setUser(null)
    setShowSettings(false)
    setMobileTab('chats')
  }

  return (
    <div className="flex h-[100dvh] w-full flex-1 flex-col overflow-hidden md:h-screen md:flex-row md:gap-0" style={{ paddingTop: 'max(0px, env(safe-area-inset-top))', paddingLeft: 'max(0px, env(safe-area-inset-left))', paddingRight: 'max(0px, env(safe-area-inset-right))' }}>
      <aside
        className={
          'relative flex h-full w-full flex-col overflow-hidden border border-emerald-100/70 bg-emerald-50/80 shadow-xl shadow-emerald-500/15 backdrop-blur dark:border-white/5 dark:bg-slate-900/80 md:w-[35%] ' +
          (mobileTab === 'chat' ? 'hidden md:block' : 'block')
        }
      >
        {/* Hide profile bar on mobile */}
        <div className="grid h-[72px] grid-cols-[1fr,auto,1fr] items-center border-b border-emerald-100/70 bg-emerald-50/90 px-6 py-4 dark:border-emerald-500/20 dark:bg-slate-950/70">
          {mobileTab === 'settings' && (
            <div className="col-span-3 text-center text-lg font-semibold md:hidden">Settings</div>
          )}
          {mobileTab !== 'settings' && (
            <>
              <div className="flex items-center gap-2">
                {editMode ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditMode(false)
                      setSelectedChats([])
                    }}
                    className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-white/80 p-2 text-emerald-700 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
                    aria-label="Exit edit mode"
                  >
                    <CloseIcon />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditMode(true)}
                    className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-white/80 p-2 text-emerald-700 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
                    aria-label="Edit chat list"
                  >
                    <PencilIcon />
                  </button>
                )}
              </div>
              <h2 className="text-center text-lg font-semibold">
                {editMode ? 'Edit' : isConnected ? 'Chats' : 'Connecting...'}
              </h2>
              <div className="flex justify-end">
                {editMode ? (
                  <button
                    type="button"
                    onClick={() => requestDeleteChats(selectedChats)}
                    disabled={!selectedChats.length}
                    className="inline-flex items-center justify-center rounded-full border border-rose-200 bg-rose-50 p-2 text-rose-600 transition hover:-translate-y-0.5 hover:border-rose-300 hover:shadow-md disabled:opacity-50 dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200"
                    aria-label="Delete chats"
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setNewChatOpen(true)}
                    className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-white/80 p-2 text-emerald-700 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
                    aria-label="New chat"
                  >
                    <PlusIcon />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
        {showSettings && (
          <div
            className="absolute bottom-20 right-4 z-10 w-52 rounded-2xl border border-emerald-100/70 bg-white p-2 text-sm shadow-xl dark:border-emerald-500/30 dark:bg-slate-950"
            ref={settingsMenuRef}
          >
            <button
              type="button"
              onClick={() => setSettingsPanel('profile')}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-emerald-700 transition hover:bg-emerald-50 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
            >
              <UserIcon />
              Edit profile
            </button>
            <button
              type="button"
              onClick={() => setSettingsPanel('security')}
              className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-emerald-700 transition hover:bg-emerald-50 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
            >
              <ShieldIcon />
              Security
            </button>
            <button
              type="button"
              onClick={() => setIsDark((prev) => !prev)}
              className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-emerald-700 transition hover:bg-emerald-50 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
            >
              {isDark ? <SunIcon /> : <MoonIcon />}
              {isDark ? 'Light mode' : 'Dark mode'}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-rose-600 transition hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
            >
              <LogoutIcon />
              Log out
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-4 pb-[104px]" style={{ overscrollBehavior: 'contain' }}>
          {mobileTab === 'settings' && !settingsPanel ? (
            <div className="space-y-4 md:hidden">
              <div className="rounded-2xl border border-emerald-100/70 bg-white/80 p-4 text-slate-700 dark:border-emerald-500/30 dark:bg-slate-950/60 dark:text-slate-200">
                <div className="flex items-center gap-3">
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={displayName}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white">
                      {displayName.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-200">
                      {displayName}
                    </p>
                    <p className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className={`h-2 w-2 rounded-full ${statusDotClass}`} />
                      {statusValue}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-emerald-100/70 bg-white/80 p-2 text-sm shadow-sm dark:border-emerald-500/30 dark:bg-slate-950/60">
                <button
                  type="button"
                  onClick={() => setSettingsPanel('profile')}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-emerald-700 transition hover:bg-emerald-50 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
                >
                  <UserIcon />
                  Edit profile
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsPanel('security')}
                  className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-emerald-700 transition hover:bg-emerald-50 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
                >
                  <ShieldIcon />
                  Security
                </button>
                <button
                  type="button"
                  onClick={() => setIsDark((prev) => !prev)}
                  className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-emerald-700 transition hover:bg-emerald-50 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
                >
                  {isDark ? <SunIcon /> : <MoonIcon />}
                  {isDark ? 'Light mode' : 'Dark mode'}
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-rose-600 transition hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
                >
                  <LogoutIcon />
                  Log out
                </button>
              </div>
            </div>
          ) : null}
          {mobileTab === 'settings' && settingsPanel === 'profile' ? (
            <div className="md:hidden">
              <div className="flex items-center gap-2 rounded-2xl border border-emerald-100/70 bg-white/80 p-4 dark:border-emerald-500/30 dark:bg-slate-950/60 mb-4">
                <button
                  type="button"
                  onClick={() => setSettingsPanel(null)}
                  className="inline-flex items-center justify-center rounded-full border border-emerald-200 p-2 text-emerald-700 transition hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
                  aria-label="Back"
                >
                  <BackIcon className="h-4 w-4" />
                </button>
                <h4 className="text-sm font-semibold text-emerald-700 dark:text-emerald-200">Edit profile</h4>
              </div>
              <form className="space-y-4" onSubmit={handleProfileSave}>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Profile photo</span>
                  <div className="mt-3 flex items-center gap-3">
                    {avatarPreview ? (
                      <img
                        src={avatarPreview}
                        alt={profileForm.nickname || profileForm.username}
                        className="h-12 w-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white">
                        {(profileForm.nickname || profileForm.username || 'S').slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <label
                        htmlFor="profilePhotoInput2"
                        className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 hover:shadow-md dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20"
                      >
                        <UploadIcon className="h-3 w-3" />
                        <span className="hidden sm:inline">Upload</span>
                      </label>
                      <input
                        id="profilePhotoInput2"
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarChange}
                        className="sr-only"
                      />
                      {avatarPreview ? (
                        <button
                          type="button"
                          onClick={() => {
                            setAvatarPreview('')
                            setProfileForm((prev) => ({ ...prev, avatarUrl: '' }))
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 hover:shadow-md dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200 dark:hover:bg-rose-800/50"
                          aria-label="Remove photo"
                        >
                          <TrashIcon className="h-3 w-3" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Nickname</span>
                  <input
                    value={profileForm.nickname}
                    onChange={(event) =>
                      setProfileForm((prev) => ({ ...prev, nickname: event.target.value }))
                    }
                    className="mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Username</span>
                  <input
                    value={profileForm.username}
                    onChange={(event) =>
                      setProfileForm((prev) => ({ ...prev, username: event.target.value }))
                    }
                    className="mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <div>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Status</p>
                  <div className="mt-2 flex flex-row gap-2">
                    {['online', 'invisible'].map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setStatusSelection(value)}
                        className={`flex items-center gap-1 rounded-xl border border-2 px-2 py-1 text-xs font-medium transition duration-200 ${
                          statusSelection === value
                            ? 'border-emerald-500 bg-emerald-100/50 text-emerald-700 shadow-md dark:border-emerald-400 dark:bg-emerald-500/20 dark:text-emerald-200'
                            : 'border-emerald-100/70 bg-white/80 text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/30 dark:border-emerald-500/30 dark:bg-slate-950/50 dark:text-slate-100 dark:hover:bg-slate-900/50'
                        }`}
                      >
                        <span className={`h-2 w-2 rounded-full ${value === 'online' ? 'bg-emerald-400' : 'bg-slate-400'}`} />
                        <span>{value.charAt(0).toUpperCase() + value.slice(1)}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:bg-emerald-400"
                >
                  Save profile
                </button>
              </form>
            </div>
          ) : null}
          {mobileTab === 'settings' && settingsPanel === 'security' ? (
            <div className="md:hidden">
              <div className="flex items-center gap-2 rounded-2xl border border-emerald-100/70 bg-white/80 p-4 dark:border-emerald-500/30 dark:bg-slate-950/60 mb-4">
                <button
                  type="button"
                  onClick={() => setSettingsPanel(null)}
                  className="inline-flex items-center justify-center rounded-full border border-emerald-200 p-2 text-emerald-700 transition hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
                  aria-label="Back"
                >
                  <BackIcon className="h-4 w-4" />
                </button>
                <h4 className="text-sm font-semibold text-emerald-700 dark:text-emerald-200">Security</h4>
              </div>
              <form className="space-y-4" onSubmit={handlePasswordSave}>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Current password
                  </span>
                  <input
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(event) =>
                      setPasswordForm((prev) => ({ ...prev, currentPassword: event.target.value }))
                    }
                    className="mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    New password
                  </span>
                  <input
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(event) =>
                      setPasswordForm((prev) => ({ ...prev, newPassword: event.target.value }))
                    }
                    className="mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Confirm new password
                  </span>
                  <input
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(event) =>
                      setPasswordForm((prev) => ({ ...prev, confirmPassword: event.target.value }))
                    }
                    className="mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <button
                  type="submit"
                  className="w-full rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:bg-emerald-400"
                >
                  Update password
                </button>
              </form>
            </div>
          ) : null}
          <div className={mobileTab === 'settings' ? 'hidden' : 'block'}>
            <div className="mt-3 space-y-2">
              {visibleConversations.length ? (
                visibleConversations.map((conv) => {
                  const members = conv.members || []
                  const other =
                    conv.type === 'dm'
                      ? members.find((member) => member.username !== user.username)
                      : null
                  const name =
                    conv.type === 'dm'
                      ? other?.nickname || other?.username || 'Direct message'
                      : conv.name || 'Chat'
                  const card = (
                    <div
                      className={`w-full rounded-2xl border px-3 py-3 text-left text-sm transition ${
                        activeConversationId === conv.id
                          ? 'border-emerald-400 bg-emerald-100 text-emerald-900 dark:border-emerald-400/60 dark:bg-emerald-500/20 dark:text-emerald-100'
                          : 'border-emerald-100/70 bg-white/80 text-slate-700 hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-sm dark:border-emerald-500/20 dark:bg-slate-950/60 dark:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {other?.avatar_url ? (
                          <img
                            src={other.avatar_url}
                            alt={name}
                            className="h-9 w-9 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white">
                            {name.slice(0, 1).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1">
                          <p className="font-semibold">{name}</p>
                          <p className="mt-1 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
                            {conv.last_message ? (
                              conv.last_sender_username === user.username ? (
                                <span>
                                  <span className="font-semibold text-slate-600 dark:text-slate-300">
                                    You:
                                  </span>{' '}
                                  {conv.last_message}
                                </span>
                              ) : (
                                conv.last_message
                              )
                            ) : (
                              'No messages yet'
                            )}
                          </p>
                        </div>
                        {!editMode ? (
                          <div className="ml-auto flex flex-col items-end gap-1">
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">
                              {conv.last_time ? formatTime(conv.last_time) : ''}
                            </p>
                            {conv.unread_count > 0 ? (
                              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-emerald-500 px-2 text-[10px] font-bold text-white">
                                {conv.unread_count}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )

                  return (
                    <div key={conv.id} className="flex items-center gap-3">
                      {editMode ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            requestDeleteChats([conv.id])
                          }}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200"
                          aria-label="Remove chat"
                        >
                          <MinusIcon className="h-5 w-5" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          if (editMode) return
                          setActiveConversationId(Number(conv.id))
                          const other =
                            conv.type === 'dm'
                              ? conv.members?.find((member) => member.username !== user.username)
                              : null
                          setActivePeer(other || null)
                          setMobileTab('chat')
                          isAtBottomRef.current = true
                          setIsAtBottom(true)
                          setUnreadInChat(0)
                          lastMessageIdRef.current = null
                        }}
                        className={`flex-1 ${editMode ? 'pointer-events-none' : ''}`}
                      >
                        {card}
                      </button>
                      {editMode ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            toggleSelectChat(conv.id)
                          }}
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-full border ${
                            selectedChats.includes(conv.id)
                              ? 'border-emerald-500 bg-emerald-500 text-white'
                              : 'border-emerald-200 text-emerald-600 dark:border-emerald-500/30 dark:text-emerald-200'
                          }`}
                          aria-label="Select chat"
                        >
                          {selectedChats.includes(conv.id) ? <CheckIcon /> : null}
                        </button>
                      ) : null}
                    </div>
                  )
                })
              ) : (
                <div className="flex h-[40vh] items-center justify-center">
                  <button
                    type="button"
                    onClick={() => setNewChatOpen(true)}
                    className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:bg-emerald-400 hover:shadow-emerald-500/40"
                  >
                    <PlusIcon />
                    New chat
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 hidden h-[88px] border-t border-emerald-100/70 bg-emerald-50/95 px-6 py-4 backdrop-blur dark:border-emerald-500/20 dark:bg-slate-950/90 md:block">
          <div className="flex h-full items-center justify-between">
            <div className="flex items-center gap-3">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={displayName}
                  className="h-10 w-10 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white">
                  {displayName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-200">{displayName}</p>
                <p className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className={`h-2 w-2 rounded-full ${statusDotClass}`} />
                  {statusValue}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowSettings((prev) => !prev)}
              className="flex items-center justify-center rounded-full border border-emerald-200 bg-white/80 p-2 text-emerald-700 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
              aria-label="Open settings"
              ref={settingsButtonRef}
            >
              <SettingsIcon />
            </button>
          </div>
        </div>
      </aside>

      <section
        className={
          'absolute inset-0 top-0 md:relative md:inset-auto md:top-auto flex h-full flex-1 flex-col overflow-hidden border border-emerald-100/70 bg-emerald-50/70 shadow-2xl shadow-emerald-500/15 backdrop-blur dark:border-white/5 dark:bg-slate-900/80 md:w-[65%] transition-all duration-300 ' +
          (mobileTab === 'chat' ? 'translate-x-0' : 'translate-x-full md:translate-x-0')
        }
      >
        {activeConversationId ? (
          <div className="flex h-[72px] items-center justify-between gap-3 border-b border-emerald-100/70 bg-emerald-50/90 px-6 py-4 dark:border-emerald-500/20 dark:bg-slate-950/70">
            <button
              type="button"
              onClick={() => {
                closeConversation()
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-emerald-200 bg-white/80 text-emerald-700 transition hover:border-emerald-300 hover:shadow-md dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200 md:hidden"
              aria-label="Back to chats"
            >
              <BackIcon className="h-5 w-5" />
            </button>
            <div className="flex flex-1 flex-col items-center justify-center gap-1">
              {activeHeaderPeer ? (
                <>
                  <h2 className="text-center text-lg font-semibold">{activeFallbackTitle}</h2>
                  <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        peerStatusLabel === 'online' ? 'bg-emerald-400' : 'bg-slate-400'
                      }`}
                    />
                    {peerStatusLabel}
                  </p>
                </>
              ) : null}
            </div>
            {activeHeaderPeer ? (
              <>
                {activeHeaderPeer?.avatar_url ? (
                  <img
                    src={activeHeaderPeer?.avatar_url}
                    alt={activeFallbackTitle}
                    className="h-9 w-9 flex-shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                    {(activeFallbackTitle || 'S').slice(0, 1).toUpperCase()}
                  </div>
                )}
              </>
            ) : null}
          </div>
        ) : null}

        <div
          ref={chatScrollRef}
          onScroll={(event) => {
            const target = event.currentTarget
            const threshold = 120
            const atBottom =
              target.scrollHeight - target.scrollTop - target.clientHeight < threshold
            setIsAtBottom(atBottom)
            isAtBottomRef.current = atBottom
            userScrolledUpRef.current = !atBottom
            setUserScrolledUp(!atBottom)
            if (atBottom) {
              setUnreadInChat(0)
            }
          }}
          className="chat-scroll flex-1 space-y-3 overflow-y-auto px-6 py-6"
          style={{
            backgroundImage:
              'radial-gradient(circle at top right, rgba(16,185,129,0.14), transparent 45%), radial-gradient(circle at bottom left, rgba(14,116,144,0.14), transparent 40%)',
          }}
        >
          {!activeConversationId ? (
            <div className="flex h-full items-center justify-center">
              <div className="rounded-full border border-emerald-200 bg-white/80 px-4 py-2 text-sm font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200">
                Select a chat to start
              </div>
            </div>
          ) : loadingMessages ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading messages...</p>
          ) : messages.length ? (
            messages.map((msg, index) => {
              const isOwn = msg.username === user.username
              const messageName = msg.nickname || msg.username
              const isRead = Boolean(msg.read_at)
              const currentDate = parseServerDate(msg.created_at)
      const prevDate =
        index > 0 ? parseServerDate(messages[index - 1].created_at) : null
              const isNewDay =
                !prevDate ||
                currentDate.toDateString() !== prevDate.toDateString()
              const dayLabel = formatDayLabel(currentDate)
              return (
                <div key={msg.id} id={`message-${msg.id}`}>
                  {isNewDay ? (
                    <div className="my-3 flex justify-center">
                      <div className="rounded-full border border-emerald-200/60 bg-white/80 px-3 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200">
                        {dayLabel}
                      </div>
                    </div>
                  ) : null}
                  {unreadMarkerId === msg.id ? (
                    <div className="my-3 flex items-center gap-3">
                      <span className="h-px flex-1 bg-emerald-200/70 dark:bg-emerald-500/30" />
                      <span className="rounded-full border border-emerald-200/60 bg-white/90 px-3 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200">
                        Unread Messages
                      </span>
                      <span className="h-px flex-1 bg-emerald-200/70 dark:bg-emerald-500/30" />
                    </div>
                  ) : null}
                  <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                        isOwn
                          ? 'bg-emerald-600 text-white rounded-br-md'
                          : 'bg-white/90 text-slate-800 rounded-bl-md dark:bg-slate-950/70 dark:text-slate-100'
                      }`}
                    >
                      {!isOwn ? null : null}
                      <p className="mt-1 whitespace-pre-wrap">{msg.body}</p>
                      <div
                        className={`mt-2 flex items-center gap-1 text-[10px] ${
                          isOwn ? 'text-emerald-50/80' : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        <span>{formatTime(currentDate)}</span>
                        {isOwn ? (
                          <span
                            className={`inline-flex items-center ${
                              isRead ? 'text-sky-400' : 'text-emerald-50/80'
                            }`}
                          >
                            <svg
                              viewBox="0 0 24 18"
                              className="h-5 w-5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.4"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M1 9l3 3 5-6" />
                              {isRead ? <path d="M9 9l3 3 9-10" /> : null}
                            </svg>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">No messages yet.</p>
          )}
        </div>

        {activeConversationId ? (
          <form
            className="flex flex-col gap-3 border-t border-emerald-100/70 bg-emerald-50/90 px-4 py-3 dark:border-emerald-500/20 dark:bg-slate-950/70 sm:px-6"
            style={{ paddingBottom: 'max(0.75rem, calc(env(safe-area-inset-bottom) + 0.75rem))' }}
            onSubmit={handleSend}
          >
            <div className="flex flex-row gap-3">
              <input
                name="message"
                type="text"
                placeholder="Type a message"
                className="flex-1 rounded-2xl border border-emerald-200 bg-white px-4 py-2 text-base text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:bg-emerald-400 hover:shadow-emerald-500/40"
              >
                <SendIcon />
              </button>
            </div>
          </form>
        ) : null}
        {activeConversationId && userScrolledUp ? (
            <button
              type="button"
              onClick={() => {
                if (chatScrollRef.current) {
                  chatScrollRef.current.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' })
                }
                setUnreadInChat(0)
                isAtBottomRef.current = true
                setIsAtBottom(true)
                userScrolledUpRef.current = false
                setUserScrolledUp(false)
              }}
              className="absolute inline-flex h-11 w-11 items-center justify-center rounded-full border border-emerald-200 bg-white/90 text-emerald-700 shadow-lg transition hover:-translate-y-0.5 hover:border-emerald-300 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
              style={{ bottom: 'max(100px + 0.75rem, calc(100px + env(safe-area-inset-bottom) + 0.75rem))', left: '50%', transform: 'translateX(-50%)' }}
              aria-label="Back to latest message"
            >
              <span className="text-lg leading-none">↓</span>
              {unreadInChat > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-emerald-500 px-2 text-[10px] font-bold text-white">
                  {unreadInChat}
                </span>
              ) : null}
            </button>
        ) : null}

        {status ? (
          <div className="border-t border-rose-200/60 bg-rose-50 px-6 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200">
            {status}
          </div>
        ) : null}
      </section>

      <div className={`fixed inset-x-0 bottom-0 z-10 px-4 sm:px-6 md:hidden ${
        mobileTab === 'chat' && activeConversationId ? 'hidden' : ''
      }`} style={{ paddingBottom: 'max(1rem, calc(env(safe-area-inset-bottom) + 1rem))' }}>
        <div className="mx-auto mb-4 flex max-w-sm items-center justify-between rounded-3xl border border-emerald-100/70 bg-white/90 p-2 shadow-lg shadow-emerald-500/10 backdrop-blur dark:border-emerald-500/30 dark:bg-slate-950/90">
            <button
              type="button"
              onClick={() => {
                setMobileTab('chats')
                setSettingsPanel(null)
              }}
              className={`relative flex flex-1 flex-col items-center gap-1 rounded-2xl px-3 py-2 text-[11px] font-semibold transition ${
                mobileTab === 'chats' ? 'text-white' : 'text-emerald-700 dark:text-emerald-200'
              }`}
            >
              {mobileTab === 'chats' ? (
                <span className="absolute inset-0 rounded-2xl bg-emerald-500" />
              ) : null}
              <span className="relative z-10">
                <ChatIcon className="h-6 w-6" />
              </span>
              <span className="relative z-10">Chats</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('settings')}
              className={`relative flex flex-1 flex-col items-center gap-1 rounded-2xl px-3 py-2 text-[11px] font-semibold transition ${
                mobileTab === 'settings' ? 'text-white' : 'text-emerald-700 dark:text-emerald-200'
              }`}
            >
              {mobileTab === 'settings' ? (
                <span className="absolute inset-0 rounded-2xl bg-emerald-500" />
              ) : null}
              <span className="relative z-10">
                <SettingsIcon className="h-6 w-6" />
              </span>
              <span className="relative z-10">Settings</span>
            </button>
        </div>
      </div>

        {newChatOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-6">
          <div className="w-full max-w-sm rounded-2xl border border-emerald-100/70 bg-white p-6 shadow-xl dark:border-emerald-500/30 dark:bg-slate-950">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-emerald-700 dark:text-emerald-200">New chat</h3>
              <button
                type="button"
                onClick={() => {
                  setNewChatOpen(false)
                  setNewChatUsername('')
                  setNewChatResults([])
                  setNewChatSelection(null)
                  setNewChatError('')
                }}
                className="flex items-center justify-center rounded-full border border-emerald-200 p-2 text-emerald-700 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="mt-4">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Username
              </label>
              <input
                value={newChatUsername}
                onChange={(event) => {
                  setNewChatUsername(event.target.value)
                  setNewChatError('')
                  setNewChatSelection(null)
                }}
                placeholder="username"
                className="mt-2 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <div className="mt-3 space-y-2">
              {newChatLoading ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">Searching...</p>
              ) : newChatResults.length ? (
                newChatResults.map((result) => (
                  <button
                    key={result.username}
                    type="button"
                    onClick={() => {
                      setNewChatSelection(result)
                      setNewChatUsername(result.username)
                    }}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left text-sm font-medium transition ${
                      newChatSelection?.username === result.username
                        ? 'border-emerald-500 border-2 bg-emerald-50 text-emerald-900 shadow-md dark:border-emerald-400 dark:bg-emerald-500/20 dark:text-emerald-100'
                        : 'border-emerald-100/70 bg-white/80 text-slate-700 hover:border-emerald-300 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900/50'
                    }`}
                  >
                    {result.avatar_url ? (
                      <img
                        src={result.avatar_url}
                        alt={result.nickname || result.username}
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white">
                        {(result.nickname || result.username).slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="font-semibold">{result.nickname || result.username}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">@{result.username}</p>
                    </div>
                  </button>
                ))
              ) : newChatUsername.trim() ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">No users found.</p>
              ) : null}
            </div>
            {!newChatSelection && newChatUsername.trim() ? (
              <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                Select a user from the list to start chatting.
              </p>
            ) : null}
            {newChatError ? (
              <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200">
                {newChatError}
              </p>
            ) : null}
            <button
              type="button"
              onClick={startDirectMessage}
              disabled={!canStartChat}
              className="mt-4 w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Start chat
            </button>
          </div>
        </div>
        )}

      {confirmDeleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
          <div className="w-full max-w-sm rounded-2xl border border-rose-100/70 bg-white p-6 shadow-xl dark:border-rose-500/30 dark:bg-slate-950">
            <h3 className="text-lg font-semibold text-rose-600 dark:text-rose-300">Delete chats</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {(pendingDeleteIds.length ? pendingDeleteIds.length : selectedChats.length) === 1
                ? 'Are you sure you want to delete this chat?'
                : `Are you sure you want to delete these ${
                    pendingDeleteIds.length ? pendingDeleteIds.length : selectedChats.length
                  } chats?`}
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(false)}
                className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-xs font-semibold text-emerald-700 transition hover:-translate-y-0.5 hover:border-emerald-300 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteChats}
                className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-600 transition hover:-translate-y-0.5 hover:border-rose-300 dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {settingsPanel && mobileTab !== 'settings' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-6">
          <div className="w-full max-w-md rounded-2xl border border-emerald-100/70 bg-white p-6 shadow-xl dark:border-emerald-500/30 dark:bg-slate-950">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-emerald-700 dark:text-emerald-200">
                {settingsPanel === 'profile' ? 'Edit profile' : 'Security'}
              </h3>
              <button
                type="button"
                onClick={() => setSettingsPanel(null)}
                className="flex items-center justify-center rounded-full border border-emerald-200 p-2 text-emerald-700 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
              >
                <CloseIcon />
              </button>
            </div>

            {settingsPanel === 'profile' && (
              <form className="mt-4 space-y-4" onSubmit={handleProfileSave}>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Profile photo</span>
                  <div className="mt-3 flex items-center gap-4">
                    {avatarPreview ? (
                      <img
                        src={avatarPreview}
                        alt={profileForm.nickname || profileForm.username}
                        className="h-14 w-14 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white">
                        {(profileForm.nickname || profileForm.username || 'S').slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="flex w-full items-center gap-2">
                      <label
                        htmlFor="profilePhotoInput"
                        className="flex cursor-pointer items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 hover:shadow-md dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20 dark:hover:shadow-md sm:px-4"
                      >
                        <UploadIcon className="h-4 w-4 flex-shrink-0" />
                        <span className="inline">Upload Photo</span>
                      </label>
                      <input
                        id="profilePhotoInput"
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarChange}
                        className="sr-only"
                      />
                      {avatarPreview ? (
                        <button
                          type="button"
                          onClick={() => {
                            setAvatarPreview('')
                            setProfileForm((prev) => ({ ...prev, avatarUrl: '' }))
                          }}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 hover:shadow-md dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200 dark:hover:bg-rose-800/50"
                          aria-label="Remove photo"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Nickname</span>
                  <input
                    value={profileForm.nickname}
                    onChange={(event) =>
                      setProfileForm((prev) => ({ ...prev, nickname: event.target.value }))
                    }
                    className="mt-2 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Username</span>
                  <input
                    value={profileForm.username}
                    onChange={(event) =>
                      setProfileForm((prev) => ({ ...prev, username: event.target.value }))
                    }
                    className="mt-2 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Status</p>
                  <div className="mt-2 flex flex-row gap-2">
                    {['online', 'invisible'].map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setStatusSelection(value)}
                        className={`flex items-center gap-2 rounded-2xl border border-2 px-3 py-2 text-xs font-medium transition duration-200 ${
                          statusSelection === value
                            ? 'border-emerald-500 bg-emerald-100/50 text-emerald-700 shadow-md dark:border-emerald-400 dark:bg-emerald-500/20 dark:text-emerald-200'
                            : 'border-emerald-100/70 bg-white/80 text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/30 dark:border-emerald-500/30 dark:bg-slate-950/50 dark:text-slate-100 dark:hover:bg-slate-900/50'
                        }`}
                      >
                        <span
                          className={`h-3 w-3 rounded-full transition duration-200 ${
                            value === 'online' ? 'bg-emerald-400' : 'bg-slate-400'
                          }`}
                        />
                        <span>{value.charAt(0).toUpperCase() + value.slice(1)}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:bg-emerald-400"
                >
                  Save profile
                </button>
              </form>
            )}

            {settingsPanel === 'security' && (
              <form className="mt-4 space-y-4" onSubmit={handlePasswordSave}>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Current password
                  </span>
                  <input
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(event) =>
                      setPasswordForm((prev) => ({ ...prev, currentPassword: event.target.value }))
                    }
                    className="mt-2 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    New password
                  </span>
                  <input
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(event) =>
                      setPasswordForm((prev) => ({ ...prev, newPassword: event.target.value }))
                    }
                    className="mt-2 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Confirm new password
                  </span>
                  <input
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(event) =>
                      setPasswordForm((prev) => ({ ...prev, confirmPassword: event.target.value }))
                    }
                    className="mt-2 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <button
                  type="submit"
                  className="w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:bg-emerald-400"
                >
                  Update password
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

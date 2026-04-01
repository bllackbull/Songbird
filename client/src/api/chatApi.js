const API_BASE = "";

const withCredentials = (options = {}) => ({
  credentials: "include",
  ...options,
});

export const apiFetch = (url, options = {}) => fetch(url, withCredentials(options));

export const fetchHealth = () => apiFetch(`${API_BASE}/api/health`);

export const pingPresence = (username) =>
  apiFetch(`${API_BASE}/api/presence`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });

export const fetchPresence = (username) =>
  apiFetch(`${API_BASE}/api/presence?username=${encodeURIComponent(username)}`);

export const searchUsers = ({ exclude, query }) =>
  apiFetch(
    `${API_BASE}/api/users?exclude=${encodeURIComponent(exclude)}&query=${encodeURIComponent(
      query,
    )}`,
  );

export const resolveMentions = ({ username, mentions }) =>
  apiFetch(`${API_BASE}/api/mentions/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, mentions }),
  });

export const fetchPushPublicKey = () => apiFetch(`${API_BASE}/api/push/public-key`);

export const subscribePush = ({ username, subscription }) =>
  apiFetch(`${API_BASE}/api/push/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, subscription }),
  });

export const unsubscribePush = ({ username, endpoint }) =>
  apiFetch(`${API_BASE}/api/push/unsubscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, endpoint }),
  });

export const sendPushTest = ({ username }) =>
  apiFetch(`${API_BASE}/api/push/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });

export const discoverUsersAndGroups = ({ username, query }) =>
  apiFetch(
    `${API_BASE}/api/discover?username=${encodeURIComponent(
      username,
    )}&query=${encodeURIComponent(query)}`,
  );

export const markMessagesRead = ({ chatId, username }) =>
  apiFetch(`${API_BASE}/api/messages/read`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId, username }),
  });

export const getMessageReadCounts = ({ chatId, username, messageIds }) =>
  apiFetch(`${API_BASE}/api/messages/read-counts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId, username, messageIds }),
  });

export const logout = () =>
  apiFetch(`${API_BASE}/api/logout`, {
    method: "POST",
  });

export const updateProfile = (payload) =>
  apiFetch(`${API_BASE}/api/profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const uploadAvatar = (payload) =>
  apiFetch(`${API_BASE}/api/profile/avatar`, {
    method: "POST",
    body: payload,
  });

export const updateStatus = (payload) =>
  apiFetch(`${API_BASE}/api/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const updatePassword = (payload) =>
  apiFetch(`${API_BASE}/api/password`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const deleteAccount = (payload) =>
  apiFetch(`${API_BASE}/api/profile/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const listChats = () => apiFetch(`${API_BASE}/api/chats`);

export const listChatsForUser = (username, options = {}) =>
  apiFetch(`${API_BASE}/api/chats?username=${encodeURIComponent(username)}`, options);

export const createChat = (payload) =>
  apiFetch(`${API_BASE}/api/chats`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const deleteChats = (payload) =>
  apiFetch(`${API_BASE}/api/chats/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const createDmChat = ({ from, to }) =>
  apiFetch(`${API_BASE}/api/chats/dm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, to }),
  });

export const createGroupChat = (payload) =>
  apiFetch(`${API_BASE}/api/chats/group`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const createChannelChat = (payload) =>
  apiFetch(`${API_BASE}/api/chats/group`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, type: "channel" }),
  });

export const getGroupInviteInfo = (token) =>
  apiFetch(`${API_BASE}/api/groups/invite/${encodeURIComponent(token)}`);

export const joinGroupByInvite = (token, payload = {}) =>
  apiFetch(`${API_BASE}/api/groups/invite/${encodeURIComponent(token)}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const getGroupInviteLink = (chatId) =>
  apiFetch(`${API_BASE}/api/chats/group/${encodeURIComponent(chatId)}/invite-link`);

export const regenerateGroupInviteLink = (chatId, payload) =>
  apiFetch(`${API_BASE}/api/chats/group/${encodeURIComponent(chatId)}/regenerate-invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const leaveGroupChat = (chatId, payload) =>
  apiFetch(`${API_BASE}/api/chats/group/${encodeURIComponent(chatId)}/leave`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const removeGroupMember = (chatId, payload) =>
  apiFetch(`${API_BASE}/api/chats/group/${encodeURIComponent(chatId)}/remove-member`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const updateGroupChat = (chatId, payload) =>
  apiFetch(`${API_BASE}/api/chats/group/${encodeURIComponent(chatId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const updateChannelChat = (chatId, payload) =>
  apiFetch(`${API_BASE}/api/chats/group/${encodeURIComponent(chatId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, type: "channel" }),
  });

export const deleteGroupChat = (chatId, payload) =>
  apiFetch(`${API_BASE}/api/chats/group/${encodeURIComponent(chatId)}/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const joinPublicGroup = (chatId, payload) =>
  apiFetch(`${API_BASE}/api/chats/group/${encodeURIComponent(chatId)}/join-public`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const uploadGroupAvatar = (chatId, payload) =>
  apiFetch(`${API_BASE}/api/chats/group/${encodeURIComponent(chatId)}/avatar`, {
    method: "POST",
    body: payload,
  });

export const getSavedMessagesChat = (username) =>
  apiFetch(`${API_BASE}/api/chats/saved?username=${encodeURIComponent(username)}`);

export const setChatMute = (chatId, payload) =>
  apiFetch(`${API_BASE}/api/chats/${encodeURIComponent(chatId)}/mute`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const hideChats = ({ username, chatIds }) =>
  apiFetch(`${API_BASE}/api/chats/hide`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, chatIds }),
  });

export const listMessages = (chatId, params = {}) => {
  const search = new URLSearchParams(params);
  const query = search.toString();
  const suffix = query ? `?${query}` : "";
  return apiFetch(`${API_BASE}/api/messages/${chatId}${suffix}`);
};

export const listMessagesByQuery = (params = {}, options = {}) => {
  const search = new URLSearchParams(params);
  const query = search.toString();
  const suffix = query ? `?${query}` : "";
  return apiFetch(`${API_BASE}/api/messages${suffix}`, options);
};

export const sendMessage = (payload) =>
  apiFetch(`${API_BASE}/api/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const deletePendingMessage = (clientId) =>
  apiFetch(`${API_BASE}/api/messages/pending/${clientId}`, {
    method: "DELETE",
  });

export const getSseStreamUrl = (username) =>
  `${API_BASE}/api/events?username=${encodeURIComponent(username)}`;

export const getMessagesUploadUrl = () => `${API_BASE}/api/messages/upload`;

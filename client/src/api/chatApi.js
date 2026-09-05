import { extractMediaPreprocessMetadata } from "../utils/mediaPreprocess.js";

const API_BASE = "";

const withCredentials = (options = {}) => ({
  credentials: "include",
  ...options,
});

export const apiFetch = (url, options = {}) => fetch(url, withCredentials(options));

export const fetchHealth = () => apiFetch(`${API_BASE}/api/health`);

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

export const subscribePush = ({ username, subscription, messagePreview }) =>
  apiFetch(`${API_BASE}/api/push/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, subscription, messagePreview }),
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

export const markMessageRead = ({ chatId, username, messageId }) =>
  apiFetch(`${API_BASE}/api/messages/read-one`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId, username, messageId }),
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

export const getProfileByUsername = (username) =>
  apiFetch(
    `${API_BASE}/api/profile?username=${encodeURIComponent(String(username || "").trim())}`,
  );

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

export const getChatPreview = ({ chatId, username, allowMissing = false }) =>
  apiFetch(
    `${API_BASE}/api/chats/${encodeURIComponent(chatId)}/preview?username=${encodeURIComponent(
      username,
    )}${allowMissing ? "&allowMissing=1" : ""}`,
  );

export const uploadGroupAvatar = (chatId, payload) =>
  apiFetch(`${API_BASE}/api/chats/group/${encodeURIComponent(chatId)}/avatar`, {
    method: "POST",
    body: payload,
  });

export const removeGroupAvatar = (chatId, payload) =>
  apiFetch(`${API_BASE}/api/chats/group/${encodeURIComponent(chatId)}/avatar`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const getRemoteChannelSettings = ({ chatId, username }) =>
  apiFetch(
    `${API_BASE}/api/chats/${encodeURIComponent(chatId)}/remote-channel?username=${encodeURIComponent(
      username,
    )}`,
  );

export const updateRemoteChannelSettings = (chatId, payload) =>
  apiFetch(`${API_BASE}/api/chats/${encodeURIComponent(chatId)}/remote-channel`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const pauseRemoteChannel = (chatId) =>
  apiFetch(`${API_BASE}/api/chats/${encodeURIComponent(chatId)}/remote-channel/pause`, {
    method: "POST",
  });

export const resumeRemoteChannel = (chatId) =>
  apiFetch(`${API_BASE}/api/chats/${encodeURIComponent(chatId)}/remote-channel/resume`, {
    method: "POST",
  });

export const skipRemoteChannelQueueItem = (chatId) =>
  apiFetch(`${API_BASE}/api/chats/${encodeURIComponent(chatId)}/remote-channel/skip`, {
    method: "POST",
  });

export const skipAllRemoteChannelQueueItems = (chatId) =>
  apiFetch(`${API_BASE}/api/chats/${encodeURIComponent(chatId)}/remote-channel/skip-all`, {
    method: "POST",
  });

export const testRemoteChannelConnection = (chatId) =>
  apiFetch(`${API_BASE}/api/chats/${encodeURIComponent(chatId)}/remote-channel/test`, {
    method: "POST",
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
  return apiFetch(`${API_BASE}/api/messages/${encodeURIComponent(chatId)}${suffix}`);
};

export const listMessagesByQuery = (params = {}, options = {}) => {
  const search = new URLSearchParams(params);
  const query = search.toString();
  const suffix = query ? `?${query}` : "";
  return apiFetch(`${API_BASE}/api/messages${suffix}`, options);
};

export const fetchFirstUnreadMessage = ({ chatId, username }, options = {}) => {
  const params = new URLSearchParams({
    chatId: String(chatId),
    username: String(username),
  });
  return apiFetch(`${API_BASE}/api/messages/first-unread?${params.toString()}`, options);
};

export const sendMessage = (payload) =>
  apiFetch(`${API_BASE}/api/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const editMessage = (payload) =>
  apiFetch(`${API_BASE}/api/messages/edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const deleteMessage = (payload) =>
  apiFetch(`${API_BASE}/api/messages/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const forwardMessage = (payload) =>
  apiFetch(`${API_BASE}/api/messages/forward`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const sendTypingIndicator = (payload) =>
  apiFetch(`${API_BASE}/api/messages/typing`, {
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

export const getWebSocketUrl = (username) => {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  const query = username ? `?username=${encodeURIComponent(username)}` : "";
  return `${protocol}//${host}/ws${query}`;
};

export const getMessagesUploadUrl = () => `${API_BASE}/api/messages/upload`;

export async function presignUploadFile(file, options = {}) {
  const fileObj = file?.file instanceof Blob ? file.file : file;
  const isBlob = fileObj instanceof Blob;

  let metadata = {};
  if (isBlob) {
    metadata = (await extractMediaPreprocessMetadata(fileObj)) || {};
  }

  const filename =
    options.filename ||
    options.originalName ||
    file?.name ||
    fileObj?.name ||
    "upload.bin";
  const contentType =
    options.contentType ||
    options.mimeType ||
    file?.type ||
    fileObj?.type ||
    "application/octet-stream";
  const fileSize = Number(
    options.fileSize ?? options.sizeBytes ?? file?.size ?? fileObj?.size ?? 0,
  );

  const payload = {
    filename,
    contentType,
    fileSize,
    width: options.width ?? metadata.width ?? null,
    height: options.height ?? metadata.height ?? null,
    duration: options.duration ?? metadata.duration ?? null,
    clientWebpThumbBase64:
      options.clientWebpThumbBase64 ?? metadata.clientWebpThumbBase64 ?? null,
    blurhash: options.blurhash ?? metadata.blurhash ?? null,
    waveform: options.waveform ?? metadata.waveform ?? null,
    ...(options.messageId ? { messageId: options.messageId } : {}),
    ...(options.encryptionType ? { encryptionType: options.encryptionType } : {}),
  };

  const res = await apiFetch(`${API_BASE}/api/uploads/presign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(
      errJson?.error || `Presign request failed with status ${res.status}`,
    );
  }

  return await res.json();
}

export async function uploadFileToPresignedUrl(uploadUrlOrOptions, file, options = {}) {
  let url = "";
  let fileBlob = null;
  let opts = {};

  if (
    typeof uploadUrlOrOptions === "object" &&
    uploadUrlOrOptions !== null &&
    !(uploadUrlOrOptions instanceof Blob)
  ) {
    if (uploadUrlOrOptions.uploadUrl) {
      url = uploadUrlOrOptions.uploadUrl;
      fileBlob = uploadUrlOrOptions.file || file;
      opts = { ...uploadUrlOrOptions, ...options };
    } else if (file && typeof file === "string") {
      url = file;
      fileBlob = uploadUrlOrOptions;
      opts = options || {};
    } else {
      fileBlob = uploadUrlOrOptions;
      url = options.uploadUrl || "";
      opts = options || {};
    }
  } else if (typeof uploadUrlOrOptions === "string") {
    url = uploadUrlOrOptions;
    fileBlob = file;
    opts = options || {};
  } else if (typeof file === "string") {
    url = file;
    fileBlob = uploadUrlOrOptions;
    opts = options || {};
  }

  const contentType =
    opts.contentType ||
    opts.mimeType ||
    fileBlob?.type ||
    "application/octet-stream";

  if (typeof opts.onProgress === "function" && typeof XMLHttpRequest !== "undefined") {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      xhr.setRequestHeader("Content-Type", contentType);
      if (opts.headers && typeof opts.headers === "object") {
        Object.entries(opts.headers).forEach(([k, v]) => {
          xhr.setRequestHeader(k, v);
        });
      }

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const percent = Math.max(
          0,
          Math.min(100, Math.round((event.loaded / event.total) * 100)),
        );
        opts.onProgress(percent, event);
      };

      xhr.onerror = () =>
        reject(new Error("Network error during file upload to presigned URL."));
      xhr.ontimeout = () =>
        reject(new Error("Upload to presigned URL timed out."));
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ ok: true, status: xhr.status, responseText: xhr.responseText });
        } else {
          reject(new Error(`S3 upload failed with status ${xhr.status}`));
        }
      };

      xhr.send(fileBlob);
    });
  }

  const uploadRes = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      ...(opts.headers || {}),
    },
    body: fileBlob,
    ...(opts.signal ? { signal: opts.signal } : {}),
  });

  if (!uploadRes.ok) {
    throw new Error(`S3 upload failed with status ${uploadRes.status}`);
  }

  return { ok: true, status: uploadRes.status };
}

export async function prepareFilesForMessage(files = [], options = {}) {
  const items = Array.isArray(files) ? files : [files];
  const presignedFiles = [];
  const localFiles = [];
  const fileMeta = [];
  const preparedList = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const fileObj = item?.file instanceof Blob ? item.file : item;
    const isBlob = fileObj instanceof Blob;

    let metadata = {};
    if (isBlob) {
      metadata = (await extractMediaPreprocessMetadata(fileObj)) || {};
    }

    const fileOptions = {
      filename: item.name || fileObj?.name || "upload.bin",
      contentType: item.type || fileObj?.type || "application/octet-stream",
      fileSize: item.size ?? fileObj?.size ?? 0,
      width: item.width ?? metadata.width ?? null,
      height: item.height ?? metadata.height ?? null,
      duration: item.duration ?? metadata.duration ?? null,
      clientWebpThumbBase64:
        item.clientWebpThumbBase64 ?? metadata.clientWebpThumbBase64 ?? null,
      blurhash: item.blurhash ?? metadata.blurhash ?? null,
      waveform: item.waveform ?? metadata.waveform ?? null,
      ...options,
    };

    let presignRes = null;
    try {
      presignRes = await presignUploadFile(fileObj, fileOptions);
    } catch (err) {
      if (err?.message) {
        console.warn("[prepareFilesForMessage] Presign failed:", err.message);
      }
      presignRes = null;
    }

    if (
      presignRes &&
      (presignRes.type === "remote" || presignRes.type === "s3") &&
      presignRes.uploadUrl
    ) {
      const onProgress = (percent) => {
        if (typeof options.onProgress === "function") {
          options.onProgress(i, percent, item);
        }
      };

      await uploadFileToPresignedUrl(presignRes.uploadUrl, fileObj, {
        contentType: fileOptions.contentType,
        onProgress,
      });

      const presignedItem = {
        storageKey: presignRes.storageKey,
        fileId: presignRes.fileId || null,
        originalName: fileOptions.filename,
        mimeType: fileOptions.contentType,
        sizeBytes: fileOptions.fileSize,
        width: fileOptions.width,
        height: fileOptions.height,
        durationSeconds: fileOptions.duration,
        blurhash: presignRes.blurhash || fileOptions.blurhash || fileOptions.clientWebpThumbBase64,
        waveform: fileOptions.waveform,
        url: presignRes.downloadUrl || (presignRes.fileId ? `/api/uploads/file/${presignRes.fileId}` : null),
      };

      presignedFiles.push(presignedItem);
      preparedList.push(presignedItem);
    } else {
      localFiles.push(item);
      preparedList.push(item);
    }

    fileMeta.push({
      originalName: fileOptions.filename,
      mimeType: fileOptions.contentType,
      sizeBytes: fileOptions.fileSize,
      width: fileOptions.width,
      height: fileOptions.height,
      durationSeconds: fileOptions.duration,
      blurhash: fileOptions.blurhash || fileOptions.clientWebpThumbBase64,
      waveform: fileOptions.waveform,
    });
  }

  return {
    presignedFiles,
    localFiles,
    fileMeta,
    files: preparedList,
  };
}

export async function uploadFile(file) {
  const metadata = (await extractMediaPreprocessMetadata(file)) || {};
  const { width, height, duration, clientWebpThumbBase64, waveform } = metadata;

  let presignRes = null;
  try {
    presignRes = await presignUploadFile(file, {
      width,
      height,
      duration,
      clientWebpThumbBase64,
      waveform,
    });
  } catch (err) {
    if (err?.message) {
      console.warn("[upload] Presign request failed:", err.message);
    }
    presignRes = null;
  }

  if (
    presignRes &&
    (presignRes.type === "remote" || presignRes.type === "s3") &&
    presignRes.uploadUrl
  ) {
    await uploadFileToPresignedUrl(presignRes.uploadUrl, file, {
      contentType: file?.type || "application/octet-stream",
    });

    if (presignRes.fileId) {
      await apiFetch(`${API_BASE}/api/uploads/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: presignRes.fileId,
          storageKey: presignRes.storageKey,
        }),
      });
    }

    return {
      fileId: presignRes.fileId,
      url: presignRes.downloadUrl || `/api/uploads/file/${presignRes.fileId}`,
      filename: file?.name,
      mimeType: file?.type,
      fileSize: file?.size,
      waveform,
      blurhash: presignRes.blurhash || clientWebpThumbBase64,
    };
  }

  const formData = new FormData();
  if (file) formData.append("file", file);
  if (width != null) formData.append("width", String(width));
  if (height != null) formData.append("height", String(height));
  if (duration != null) formData.append("duration", String(duration));
  if (clientWebpThumbBase64 != null) formData.append("clientWebpThumbBase64", clientWebpThumbBase64);
  if (waveform != null) formData.append("waveform", typeof waveform === "string" ? waveform : JSON.stringify(waveform));

  const localRes = await apiFetch(`${API_BASE}/api/uploads`, {
    method: "POST",
    body: formData,
  });

  if (!localRes.ok) {
    const errData = await localRes.json().catch(() => ({}));
    throw new Error(errData.error || `Upload failed with status ${localRes.status}`);
  }

  return await localRes.json();
}

export async function claimAdminPrivileges(token) {
  const res = await apiFetch(`${API_BASE}/api/admin/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  return res.json();
}

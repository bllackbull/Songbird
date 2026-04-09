export function createSseHub({ listChatMembers }) {
  const sseClientsByUsername = new Map();

  function addSseClient(username, res) {
    const key = String(username || "").toLowerCase();
    if (!key) return;
    const clients = sseClientsByUsername.get(key) || new Set();
    clients.add(res);
    sseClientsByUsername.set(key, clients);
  }

  function removeSseClient(username, res) {
    const key = String(username || "").toLowerCase();
    if (!key) return;
    const clients = sseClientsByUsername.get(key);
    if (!clients) return;
    clients.delete(res);
    if (!clients.size) {
      sseClientsByUsername.delete(key);
    }
  }

  function emitSseEvent(username, payload) {
    const key = String(username || "").toLowerCase();
    if (!key) return;
    const clients = sseClientsByUsername.get(key);
    if (!clients?.size) return;

    const message = `data: ${JSON.stringify(payload)}\n\n`;
    clients.forEach((client) => {
      try {
        client.write(message);
      } catch (_) {
        // connection cleanup is handled on close
      }
    });
  }

  function emitChatEvent(chatId, payload) {
    const members = listChatMembers(Number(chatId));
    members.forEach((member) => {
      if (!member?.username) return;
      emitSseEvent(member.username, payload);
    });
  }

  return {
    addSseClient,
    removeSseClient,
    emitSseEvent,
    emitChatEvent,
  };
}

(() => {
  if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) return;

  const statusHandlers = new Set();
  const dataHandlers = new Set();
  let eventSource = null;

  async function requestJson(url, options) {
    const response = await fetch(url, options);
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || `Local service returned ${response.status}`);
    return value;
  }

  function ensureEvents() {
    if (eventSource) return;
    eventSource = new EventSource('/api/events');
    eventSource.addEventListener('status', (event) => {
      const status = JSON.parse(event.data);
      statusHandlers.forEach((callback) => callback(status));
    });
    eventSource.addEventListener('data', (event) => {
      const frame = JSON.parse(event.data);
      dataHandlers.forEach((callback) => callback(frame));
    });
  }

  window.ptlLocalHardware = {
    getStatus: () => requestJson('/api/status'),
    listPorts: () => requestJson('/api/ports'),
    connect: (config) => requestJson('/api/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    }).then((result) => result.status),
    onStatus: (callback) => {
      statusHandlers.add(callback);
      ensureEvents();
      return () => statusHandlers.delete(callback);
    },
    onData: (callback) => {
      dataHandlers.add(callback);
      ensureEvents();
      return () => dataHandlers.delete(callback);
    }
  };
})();
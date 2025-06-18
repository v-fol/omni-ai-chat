export function connectWebSocket(
  url: string,
  onMessage: (text: string) => void,
  onError: (error: Error) => void,
  onOpen?: () => void
): WebSocket {
  const wsUrl = new URL(url);
  wsUrl.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

  const ws = new WebSocket(wsUrl.toString());

  ws.onopen = () => {
    console.log('WebSocket connected successfully');
    onOpen?.();
  };

  ws.onmessage = (event) => {
    onMessage(event.data);
  };

  ws.onerror = (event) => {
    console.error('WebSocket error:', event);
    onError(new Error('WebSocket error occurred'));
  };

  ws.onclose = (event) => {
    console.log('WebSocket closed:', event.code, event.reason);
    if (event.code !== 1000) {
        onError(new Error(`WebSocket closed unexpectedly: ${event.reason || event.code}`));
    }
  };

  return ws;
}

export function sendMessage(ws: WebSocket | null, message: string): boolean {
  if (!ws) {
    console.error('No WebSocket connection provided');
    return false;
  }

  if (ws.readyState !== WebSocket.OPEN) {
    console.error('WebSocket is not in OPEN state:', ws.readyState);
    // You might want to queue the message here instead of failing
    return false;
  }

  try {
    ws.send(message);
    return true;
  } catch (error) {
    console.error('Failed to send message:', error);
    return false;
  }
}

export function closeWebSocket(ws: WebSocket | null) {
  if (ws) {
    ws.close(1000, 'Closed by client');
  }
}

// This function is no longer needed as the WebSocket state is managed by the component.
// export function getWebSocketState(): WebSocket | null {
//   return ws;
// } 
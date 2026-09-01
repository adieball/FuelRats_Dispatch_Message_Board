export interface IRCMessage {
  type: 'message' | 'system' | 'join' | 'part' | 'quit' | 'action' | 'notice' | 'identify';
  channel?: string;
  nick?: string;
  text: string;
  timestamp: Date;
  caseId?: string; // Extracted case ID if message is case-related
}

export type IRCConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export class IRCWebSocketService {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 3000;
  
  public status: IRCConnectionStatus = 'disconnected';
  public myNick: string | null = null; // Our IRC nick, set via IDENTIFY from AdiIRC
  public onMessage: ((message: IRCMessage) => void) | null = null;
  public onStatusChange: ((status: IRCConnectionStatus) => void) | null = null;
  public onError: ((error: string) => void) | null = null;
  public onConnectionFailed: (() => void) | null = null; // called each time a connection attempt fails

  /**
   * Connect to AdiIRC WebSocket server
   */
  connect(url: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      console.log('[IRC WS] Connecting to bridge...');
      this.updateStatus('connecting');
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('[IRC WS] Connected');
        this.reconnectAttempts = 0;
        this.updateStatus('connected');
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (error) {
          console.error('[IRC WS] Error parsing message:', error);
        }
      };

      this.ws.onerror = () => {
        console.error('[IRC WS] Connection error');
        this.updateStatus('error');
        if (this.onError) this.onError('WebSocket connection error');
        if (this.onConnectionFailed) this.onConnectionFailed();
      };

      this.ws.onclose = (event) => {
        console.log(`[IRC WS] Closed — code ${event.code}`);
        this.updateStatus('disconnected');
        this.attemptReconnect(url);
      };
    } catch (error) {
      console.error('[IRC WS] Failed to connect:', (error as Error).message);
      this.updateStatus('error');
      if (this.onError) this.onError('Failed to connect: ' + (error as Error).message);
    }
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent auto-reconnect
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.updateStatus('disconnected');
  }

  /**
   * Drop any current socket and connect again, resetting the retry budget.
   *
   * Used after a LAN rebind, which closes the listener the existing
   * connection was using. disconnect() also prevents auto-reconnect, so a
   * follow-up connect() would have no retries left if the first attempt
   * landed while the port was still down.
   */
  reconnect(url: string): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    const old = this.ws;
    this.ws = null;
    if (old) {
      old.onclose = null;
      old.onerror = null;
      old.onmessage = null;
      old.onopen = null;
      try { old.close(); } catch { /* already closed */ }
    }
    this.connect(url);
  }

  /**
   * Send a message to IRC via WebSocket
   */
  sendMessage(target: string, message: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const payload = {
        type: 'message',
        target,
        text: message
      };
      this.ws.send(JSON.stringify(payload));
    } else {
      console.error('Cannot send message: WebSocket not connected');
      if (this.onError) {
        this.onError('Cannot send message: Not connected to IRC');
      }
    }
  }

  /**
   * Send a raw IRC command
   */
  sendRaw(command: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const payload = {
        type: 'raw',
        command
      };
      this.ws.send(JSON.stringify(payload));
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: any): void {
    // Capture our IRC nick from IDENTIFY messages
    if (data.type === 'identify' && data.nick) {
      this.myNick = data.nick;
      console.log('[IRC WS] Identified as:', this.myNick);
      return; // Don't forward identify to message handlers
    }

    const ircMessage: IRCMessage = {
      type: data.type || 'message',
      channel: data.channel,
      nick: data.nick,
      text: data.text || data.message || '',
      timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
    };

    // Try to extract case ID from message
    const caseId = this.extractCaseId(ircMessage.text);
    if (caseId) {
      ircMessage.caseId = caseId;
    }

    if (this.onMessage) {
      this.onMessage(ircMessage);
    }
  }

  /**
   * Extract case ID from message text
   * Looks for patterns like: #0, #1, #15, case 5, etc.
   */
  private extractCaseId(text: string): string | undefined {
    // Pattern: #0-20 or case 0-20
    const patterns = [
      /#(\d{1,2})\b/i,           // #5, #15
      /\bcase[:\s]+(\d{1,2})\b/i, // case 5, case: 15
      /\[(\d{1,2})\]/,            // [5]
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const caseNum = parseInt(match[1], 10);
        if (caseNum >= 0 && caseNum <= 20) {
          return `case-${caseNum.toString().padStart(2, '0')}`;
        }
      }
    }

    return undefined;
  }

  /**
   * Update connection status
   */
  private updateStatus(status: IRCConnectionStatus): void {
    this.status = status;
    if (this.onStatusChange) {
      this.onStatusChange(status);
    }
  }

  /**
   * Attempt to reconnect after disconnect
   */
  private attemptReconnect(url: string): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;

    this.reconnectAttempts++;
    console.log(`[IRC WS] Reconnecting (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    this.reconnectTimer = window.setTimeout(() => this.connect(url), this.reconnectDelay);
  }

  /**
   * Get current connection status
   */
  getStatus(): IRCConnectionStatus {
    return this.status;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const ircWebSocket = new IRCWebSocketService();

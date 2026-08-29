import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import disconnectIcon from './image/Disconnect_Icon.png';
import { CodeRedTimerBadge, isLPadStation, type Case, type CaseStatus } from './DispatchBoard';
import { CopyableSystem } from './CopyableSystem';
import { CaseNotes } from './CaseNotes';
import { ClientHistory } from './CaseHistory';
import { distanceToSeconds, SCO_SHIPS, type ScoShipKey } from '../services/scTime';
import { translateText, toDeepLTargetLang, getDeepLApiKey, setDeepLApiKey } from '../services/translationService';
import { langblyTranslate, toLangblyTargetLang, getLangblyApiKey, setLangblyApiKey } from '../services/langblyService';
import {
  getColorSettings,
  classifyMessageRole,
} from '../services/colorSettingsService';
import { openEdsmPopout } from '../services/edsmPopout';
import { bridgeProxyUrl } from '../services/bridgeUrls';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { rescueMessages, dispatchMessages } from '../config/quickMessages';
import type { QuickMessage, QuickMessageGroup, Variant } from '../config/quickMessages';

const DEFAULT_BUTTON_GROUPS: QuickMessageGroup[] = [
  { label: 'RESCUE', messages: rescueMessages },
  dispatchMessages,
];
import {
  User,
  Clock,
  AlertTriangle,
  Send,
  Users,
  Zap,
  MoreVertical,
  Languages,
  X,
  ChevronDown,
} from 'lucide-react';

interface CaseWindowProps {
  caseData: Case;
  totalCases: number;
  caseIndex: number;
  onAddMessage: (caseId: string, text: string, channel?: string, original?: string) => void;
  onStatusChange: (caseId: string, status: CaseStatus) => void;
  onClose: (caseId: string) => void;
  onAssignRat: (caseId: string, ratName: string) => void;
  onRemoveRat: (caseId: string, ratName: string) => void;
  hasUnread?: boolean;
  onClearUnread: (caseId: string) => void;
  ircConnected: boolean;
  clientInChannel: boolean;
  buttonGroups?: QuickMessageGroup[];
  onSetTranslation: (caseId: string, messageId: string, translation: string) => void;
  onSetCodeRedTimer: (caseId: string, seconds: number) => void;
}

const statusColors = {
  open: 'border-blue-500',
  assigned: 'border-yellow-500',
  'code-red': 'border-red-500',
  inactive: 'border-slate-500',
  closed: 'border-slate-500',
};

const statusBgColors = {
  open: 'bg-blue-500/10',
  assigned: 'bg-yellow-500/10',
  'code-red': 'bg-red-500/10',
  inactive: 'bg-slate-500/10',
  closed: 'bg-slate-500/10',
};

// Supercruise timing lives in services/scTime.ts so rat mode shows the same
// numbers for the same case.

export function CaseWindow({
  caseData,
  totalCases,
  caseIndex: _caseIndex,
  onAddMessage,
  onStatusChange: _onStatusChange,
  onClose: _onClose,
  onAssignRat: _onAssignRat,
  onRemoveRat: _onRemoveRat,
  hasUnread = false,
  onClearUnread,
  ircConnected,
  clientInChannel,
  buttonGroups = DEFAULT_BUTTON_GROUPS,
  onSetTranslation,
  onSetCodeRedTimer,
}: CaseWindowProps) {
  const [messageInput, setMessageInput] = useState('');
  const [isFlickering, setIsFlickering] = useState(false);
  const [tabIndex, setTabIndex] = useState(-1);
  const [tabBase, setTabBase] = useState('');
  const [tabWordStart, setTabWordStart] = useState(0);
  const [caseElapsedTime, setCaseElapsedTime] = useState(0);
  const [activityElapsedTime, setActivityElapsedTime] = useState(0);
  const [combinedPopoverOpen, setCombinedPopoverOpen] = useState(false);
  const [translateEnabled, setTranslateEnabled] = useState(false);
  const [deeplEnabled, setDeeplEnabled] = useState(false);
  const [deeplApiKey, setDeeplApiKeyState] = useState(() => getDeepLApiKey());
  const [deeplUsage, setDeeplUsage] = useState<{ count: number; limit: number } | null>(null);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [langblyEnabled, setLangblyEnabled] = useState(false);
  const [langblyApiKey, setLangblyApiKeyState] = useState(() => getLangblyApiKey());
  const [showLangblyKeyInput, setShowLangblyKeyInput] = useState(false);
  const [rootPopoverOpen, setRootPopoverOpen] = useState<Record<number, boolean>>({});
  const [editingQuote, setEditingQuote] = useState<{ index: number; text: string } | null>(null);
  const [subPopoverOpen, setSubPopoverOpen] = useState<Record<string, boolean>>({});
  const [openRatMenuId, setOpenRatMenuId] = useState<string | null>(null);
  const [stationHover, setStationHover] = useState(false);
  const [stationPopupOffset, setStationPopupOffset] = useState(0);
  const stationHideTimer = useRef<number | null>(null);
  const stationPopupRef = useRef<HTMLDivElement>(null);
  const [scoopableHover, setScoopableHover] = useState(false);
  const [scoopablePopupOffset, setScoopablePopupOffset] = useState(0);
  const scoopableHideTimer = useRef<number | null>(null);
  const scoopablePopupRef = useRef<HTMLDivElement>(null);
  const [scoShip, setScoShip] = useState<ScoShipKey>('cobra');
  const [gravityMode, setGravityMode] = useState<'off' | 'grav' | 'nosco'>('off');
  // Open by default: the notes are the point of taking them, and a case rarely
  // has more than a handful.
  const [notesCollapsed, setNotesCollapsed] = useState(false);
  const [shipHover, setShipHover] = useState(false);
  const [shipPopupOffset, setShipPopupOffset] = useState(0);
  const shipHideTimer = useRef<number | null>(null);
  const shipPopupRef = useRef<HTMLDivElement>(null);
  const [colorSettings] = useState(() => getColorSettings());
  const nickMode = colorSettings.target === 'nick';

  useLayoutEffect(() => {
    if (stationHover && stationPopupRef.current) {
      const rect = stationPopupRef.current.getBoundingClientRect();
      const overflow = rect.right - window.innerWidth + 8;
      setStationPopupOffset(overflow > 0 ? -overflow : 0);
    } else {
      setStationPopupOffset(0);
    }
  }, [stationHover]);

  useLayoutEffect(() => {
    if (scoopableHover && scoopablePopupRef.current) {
      const rect = scoopablePopupRef.current.getBoundingClientRect();
      const overflow = rect.right - window.innerWidth + 8;
      setScoopablePopupOffset(overflow > 0 ? -overflow : 0);
    } else {
      setScoopablePopupOffset(0);
    }
  }, [scoopableHover]);

  useLayoutEffect(() => {
    if (shipHover && shipPopupRef.current) {
      const rect = shipPopupRef.current.getBoundingClientRect();
      const overflow = rect.right - window.innerWidth + 8;
      setShipPopupOffset(overflow > 0 ? -overflow : 0);
    } else {
      setShipPopupOffset(0);
    }
  }, [shipHover]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [caseData.messages]);

  // Fetch DeepL usage when enabled
  useEffect(() => {
    if (!deeplEnabled) return;
    const apiKey = getDeepLApiKey();
    if (!apiKey) return;
    const proxyBase = bridgeProxyUrl();
    const url = `${proxyBase}/${apiKey.endsWith(':fx') ? 'deepl-proxy' : 'deepl-proxy-pro'}/v2/usage`;
    fetch(url, { headers: { Authorization: `DeepL-Auth-Key ${apiKey}` } })
      .then((r) => r.json())
      .then((d) => setDeeplUsage({ count: d.character_count, limit: d.character_limit }))
      .catch(() => {});
  }, [deeplEnabled]);

  // Auto-translate new incoming messages via DeepL when enabled
  useEffect(() => {
    if (!deeplEnabled) return;
    const messages = caseData.messages;
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    // Only translate non-system, non-notice, non-bot messages that don't already have a translation
    if (last.isSystem || last.isNotice || last.translation) return;
    if (last.sender.toLowerCase().includes('[bot]')) return;
    // Skip messages from assigned rats
    const senderLower = last.sender.toLowerCase();
    const isRat = caseData.assignedRats.some((rat) => {
      const nick = caseData.ratIrcNicks?.[rat] ?? rat;
      return nick.toLowerCase() === senderLower || rat.toLowerCase() === senderLower;
    });
    if (isRat) return;
    // Skip messages containing a case number reference (dispatcher/rat coordination)
    if (/\b#\d{1,2}\b/.test(last.text)) return;
    // Skip if the case language is English — no point calling the API
    const lang = caseData.language?.toLowerCase() ?? '';
    if (lang.startsWith('en')) return;
    translateText(last.text).then((result) => {
      if (result) onSetTranslation(caseData.id, last.id, result);
    });
  }, [caseData.messages, deeplEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-translate new incoming messages via Langbly when enabled
  useEffect(() => {
    if (!langblyEnabled) return;
    const messages = caseData.messages;
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.isSystem || last.isNotice || last.translation) return;
    if (last.sender.toLowerCase().includes('[bot]')) return;
    const senderLower = last.sender.toLowerCase();
    const isRat = caseData.assignedRats.some((rat) => {
      const nick = caseData.ratIrcNicks?.[rat] ?? rat;
      return nick.toLowerCase() === senderLower || rat.toLowerCase() === senderLower;
    });
    if (isRat) return;
    if (/\b#\d{1,2}\b/.test(last.text)) return;
    const lang = caseData.language?.toLowerCase() ?? '';
    if (lang.startsWith('en')) return;
    langblyTranslate(last.text, 'en').then((result) => {
      if (result) onSetTranslation(caseData.id, last.id, result);
    });
  }, [caseData.messages, langblyEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger flicker effect based on case status and messages
  const lastMessageId = caseData.messages[caseData.messages.length - 1]?.id;
  useEffect(() => {
    const lastMessage = caseData.messages[caseData.messages.length - 1];

    // For Code Red cases: flash continuously if only system messages exist
    if (caseData.status === 'code-red') {
      // Check if there are any non-system messages (excluding "Incoming Client" and disconnect/reconnect messages)
      const hasRealMessages = caseData.messages.some(msg => {
        // Skip system messages
        if (msg.isSystem) return false;
        
        // Skip "Incoming Client" message
        if (msg.text.includes('Incoming Client')) return false;
        
        // If we get here, it's a real message from a user/rat
        return true;
      });
      
      if (!hasRealMessages) {
        // Keep flashing if no real messages
        setIsFlickering(true);
      } else {
        // Stop flashing once we have a real message
        setIsFlickering(false);
      }
    } else {
      // For non-Code Red cases: brief flicker on external messages
      if (lastMessage && lastMessage.sender !== 'Dispatch' && !lastMessage.isSystem) {
        setIsFlickering(true);
        const timer = setTimeout(() => {
          setIsFlickering(false);
        }, 180);
        return () => clearTimeout(timer);
      } else {
        setIsFlickering(false);
      }
    }
    // Keyed on the last message's id, not on the messages array.
    //
    // The array's identity changes on every refetch, and an effect watching it
    // fired the 180ms grey flash each time even when no message had arrived --
    // so cases blinked on a timer, with no update behind it. Anything that
    // rewrites a message in place, such as attaching a translation, also changed
    // the identity without changing the last id, and should not flash either.
  }, [lastMessageId, caseData.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Timer for case elapsed time (from case creation)
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - caseData.createdAt.getTime()) / 1000);
      setCaseElapsedTime(elapsed);
    }, 1000);
    return () => clearInterval(interval);
  }, [caseData.createdAt]);

  // Timer for activity (from last message of any kind)
  useEffect(() => {
    const lastMessage = caseData.messages[caseData.messages.length - 1];

    if (lastMessage) {
      const interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - lastMessage.timestamp.getTime()) / 1000);
        // Cap at 10 minutes (600 seconds)
        setActivityElapsedTime(Math.min(elapsed, 600));
      }, 1000);
      return () => clearInterval(interval);
    } else {
      // No messages yet, start from case creation
      const interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - caseData.createdAt.getTime()) / 1000);
        setActivityElapsedTime(Math.min(elapsed, 600));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [caseData.messages, caseData.createdAt]);

  // Returns unique speakers from messages in last-spoke order (most recent first).
  // Always includes the client's IRC nick / CMDR name so TAB works before they've spoken.
  const getLastSpokeOrder = (): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (let i = caseData.messages.length - 1; i >= 0; i--) {
      const msg = caseData.messages[i];
      if (!msg.isSystem && msg.sender !== 'Dispatch' && !seen.has(msg.sender)) {
        seen.add(msg.sender);
        result.push(msg.sender);
      }
    }
    const clientNick = caseData.ircNick || caseData.clientName;
    if (clientNick && !seen.has(clientNick)) {
      result.push(clientNick);
    }
    return result;
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim()) return;

    let finalMessage = messageInput;
    const isCommand = messageInput.trim().startsWith('!');

    if (translateEnabled && isCommand) {
      // For ! commands, append -a only if the command is in the whitelist
      const parts = messageInput.trim().split(/\s+/);
      const command = parts[0].toLowerCase();
      const args = parts.slice(1).join(' ');
      if (trCommands.has(command)) {
        finalMessage = `${command}-a${args ? ' ' + args : ''}`;
      }
    } else if (translateEnabled) {
      // Apply /tr formatting for regular messages
      const caseNumber = parseInt(caseData.id.split('-')[1], 10);
      finalMessage = `/tr ${caseNumber} ${messageInput}`;
    } else if (deeplEnabled && caseData.language && !caseData.language.toLowerCase().startsWith('en')) {
      // DeepL fallback: mirror /tr behaviour for commands, translate text messages
      if (isCommand) {
        const parts = messageInput.trim().split(/\s+/);
        const command = parts[0].toLowerCase();
        const args = parts.slice(1).join(' ');
        if (trCommands.has(command)) {
          finalMessage = `${command}-a${args ? ' ' + args : ''}`;
        }
      } else {
        const targetLang = toDeepLTargetLang(caseData.language);
        const translated = await translateText(messageInput, targetLang);
        if (translated) finalMessage = translated;
      }
    } else if (langblyEnabled && caseData.language && !caseData.language.toLowerCase().startsWith('en')) {
      if (isCommand) {
        const parts = messageInput.trim().split(/\s+/);
        const command = parts[0].toLowerCase();
        const args = parts.slice(1).join(' ');
        if (trCommands.has(command)) {
          finalMessage = `${command}-a${args ? ' ' + args : ''}`;
        }
      } else {
        const targetLang = toLangblyTargetLang(caseData.language);
        const translated = await langblyTranslate(messageInput, targetLang);
        if (translated) finalMessage = translated;
      }
    }

    const original = finalMessage !== messageInput ? messageInput : undefined;
    onAddMessage(caseData.id, finalMessage, undefined, original);
    setMessageInput('');
    setTabIndex(-1);
    setTabBase('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSendMessage();
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const nicks = getLastSpokeOrder();
      if (nicks.length === 0) return;

      let base: string;
      let wordStart: number;
      let nextIndex: number;

      if (tabIndex === -1) {
        // Start new completion from cursor position
        const cursorPos = e.currentTarget.selectionStart ?? messageInput.length;
        const textBeforeCursor = messageInput.substring(0, cursorPos);
        const lastSpaceIndex = textBeforeCursor.lastIndexOf(' ');
        wordStart = lastSpaceIndex + 1;
        base = textBeforeCursor.substring(wordStart);
        nextIndex = 0;
      } else {
        // Continue cycling
        base = tabBase;
        wordStart = tabWordStart;
        nextIndex = tabIndex + 1;
      }

      const matchingNicks = nicks.filter((n) =>
        n.toLowerCase().startsWith(base.toLowerCase())
      );
      if (matchingNicks.length === 0) return;

      nextIndex = nextIndex % matchingNicks.length;
      const suffix = ' ';
      const newValue =
        messageInput.substring(0, wordStart) + matchingNicks[nextIndex] + suffix;

      setMessageInput(newValue);
      setTabIndex(nextIndex);
      setTabBase(base);
      setTabWordStart(wordStart);
      return;
    }

    // Reset tab completion on any non-modifier key
    const isModifier = ['Shift', 'Control', 'Alt', 'Meta', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key);
    if (!isModifier && tabIndex !== -1) {
      setTabIndex(-1);
      setTabBase('');
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessageInput(e.target.value);
    // Close menu when user starts typing
    if (combinedPopoverOpen) {
      setCombinedPopoverOpen(false);
      setRootPopoverOpen({});
      setSubPopoverOpen({});
    }
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatElapsedTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const widthPercent = 100 / totalCases;

  const handleChatAreaClick = () => {
    if (hasUnread) {
      onClearUnread(caseData.id);
    }
  };

  const caseNumber = parseInt(caseData.id.split('-')[1], 10);

  // Returns the IRC nick to use in bot commands for an assigned rat.
  // Uses the nick resolved from relay messages; falls back to quoting if name has spaces.
  const getRatIrcNick = (cmdrName: string): string =>
    caseData.ratIrcNicks[cmdrName] ?? (cmdrName.includes(' ') ? `"${cmdrName}"` : cmdrName);

  // Short display label for platform (e.g. "PC - Odyssey" → "ODY", "Xbox - Odyssey" → "XB")
  const getPlatformShorthand = (): string => {
    const p = caseData.platform.toLowerCase();
    if (p.includes('legacy')) return 'LEG';
    if (p.includes('xbox')) return 'XB';
    if (p.includes('playstation')) return 'PS';
    if (p.includes('horizons')) return 'HOR';
    if (p.includes('odyssey')) return 'ODY';
    if (p.includes('pc')) return 'PC';
    return caseData.platform;
  };

  // Detect platform key from caseData.platform string (e.g. "PC - Odyssey" → "pc")
  const getPlatformKey = (): 'pc' | 'xbox' | 'playstation' | 'legacy' | null => {
    const p = caseData.platform.toLowerCase();
    if (p.includes('legacy')) return 'legacy';
    if (p.includes('xbox')) return 'xbox';
    if (p.includes('playstation')) return 'playstation';
    if (p.includes('pc')) return 'pc';
    return null;
  };

  // Resolve {clientName}, {caseNumber}, {ratCmdrNick}, {ratIrcNick} placeholders in quick message templates
  // Priority: platformVariants > variants > message (and tr equivalents)
  const resolveMessage = (msg: QuickMessage) => {
    const pick = (pool: Variant[]) => {
      const totalWeight = pool.reduce((sum, v) => sum + (typeof v === 'string' ? 1 : v.weight), 0);
      let rand = Math.random() * totalWeight;
      for (const v of pool) {
        rand -= typeof v === 'string' ? 1 : v.weight;
        if (rand <= 0) return typeof v === 'string' ? v : v.message;
      }
      const last = pool[pool.length - 1];
      return typeof last === 'string' ? last : last.message;
    };
    const platformKey = getPlatformKey();

    // Determine template: platform-specific first, then random variants, then plain message
    let template: string;
    if (translateEnabled) {
      const trPlatform = platformKey && msg.trPlatformVariants?.[platformKey];
      const trDefault = msg.trPlatformVariants?.['default'];
      const trPool = msg.trVariants?.length ? msg.trVariants : msg.trMessage ? [msg.trMessage] : null;
      const nonTrPlatform = platformKey && msg.platformVariants?.[platformKey];
      const nonTrDefault = msg.platformVariants?.['default'];
      const nonTrPool = msg.variants?.length ? msg.variants : [msg.message];
      template = trPlatform || trDefault || (trPool ? pick(trPool) : '') || nonTrPlatform || nonTrDefault || pick(nonTrPool);
    } else {
      const platform = platformKey && msg.platformVariants?.[platformKey];
      const fallback = msg.platformVariants?.['default'];
      const pool = msg.variants?.length ? msg.variants : [msg.message];
      template = platform || fallback || pick(pool);
    }

    const clientName = caseData.ircNick || caseData.clientName;

    const formatList = (items: string[]): string => {
      if (items.length === 0) return '';
      if (items.length === 1) return items[0];
      return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
    };
    const ratCmdrNick = formatList(caseData.assignedRats.map((r) => `"${r}"`));
    const ratIrcNick = formatList(caseData.assignedRats.map(getRatIrcNick));

    return template
      .replace(/\{clientName\}/g, clientName)
      .replace(/\{caseNumber\}/g, String(caseNumber))
      .replace(/\{ratCmdrNick\}/g, ratCmdrNick)
      .replace(/\{ratIrcNick\}/g, ratIrcNick);
  };

  // Commands that support the -a (auto-translate) suffix
  const trCommands = new Set([
    '!crinst', '!donate', '!fueltank', '!invite', '!kgbfoam', '!multi',
    '!o2synth', '!oldcrinst', '!oldkgbfoam', '!pg', '!pqueue', '!prep',
    '!prepcr', '!reboot', '!rto', '!sc', '!quit', '!team', '!relog',
    '!modules', '!open', '!frcr', '!wing', '!beacon', '!fr', '!gofr', '!go',
  ]);

  const sendQuickMessage = async (message: string, keepOpen?: boolean) => {
    let finalMessage = message;
    const isCommand = message.startsWith('!');

    // If /tr is enabled and command supports -a, add -a after the command
    if (translateEnabled && isCommand) {
      const parts = message.split(' ');
      const command = parts[0];
      const args = parts.slice(1).join(' ');
      if (trCommands.has(command)) {
        finalMessage = `${command}-a${args ? ' ' + args : ''}`;
      }
    } else if (translateEnabled && !isCommand) {
      // Regular messages get /tr prefix
      finalMessage = `/tr ${caseNumber} ${message}`;
    } else if (deeplEnabled && caseData.language && !caseData.language.toLowerCase().startsWith('en')) {
      // DeepL fallback: mirror /tr behaviour for commands, translate text messages
      if (isCommand) {
        const parts = message.split(' ');
        const command = parts[0];
        const args = parts.slice(1).join(' ');
        if (trCommands.has(command)) {
          finalMessage = `${command}-a${args ? ' ' + args : ''}`;
        }
      } else {
        const targetLang = toDeepLTargetLang(caseData.language);
        const translated = await translateText(message, targetLang);
        if (translated) finalMessage = translated;
      }
    } else if (langblyEnabled && caseData.language && !caseData.language.toLowerCase().startsWith('en')) {
      if (isCommand) {
        const parts = message.split(' ');
        const command = parts[0];
        const args = parts.slice(1).join(' ');
        if (trCommands.has(command)) {
          finalMessage = `${command}-a${args ? ' ' + args : ''}`;
        }
      } else {
        const targetLang = toLangblyTargetLang(caseData.language);
        const translated = await langblyTranslate(message, targetLang);
        if (translated) finalMessage = translated;
      }
    }

    onAddMessage(caseData.id, finalMessage);
    if (!keepOpen) {
      setTimeout(() => {
        messageInputRef.current?.focus();
      }, 0);
    }
  };

  const renderGroupContent = (group: QuickMessageGroup, pathKey: string) => (
    <div className="space-y-1">
      {group.subgroups?.map((sg, i) => {
        const key = pathKey ? `${pathKey}-s${i}` : `s${i}`;
        return (
          <Popover
            key={key}
            open={subPopoverOpen[key] || false}
            onOpenChange={(open) => setSubPopoverOpen((prev) => ({ ...prev, [key]: open }))}
          >
            <PopoverTrigger className="w-full text-xs h-8 bg-slate-900 border border-slate-600 text-white hover:bg-slate-700 rounded px-2">
              {'>'}{sg.label}{'<'}
            </PopoverTrigger>
            <PopoverContent className="w-56 bg-slate-800/90 backdrop-blur-md border-slate-700 p-2" side="right" align="start">
              {renderGroupContent(sg, key)}
            </PopoverContent>
          </Popover>
        );
      })}
      {group.messages?.map((msg, i) => (
        <Button
          key={i}
          variant="outline"
          size="sm"
          className="w-full text-xs h-8 bg-slate-900 border-slate-600 text-white hover:bg-slate-700"
          onMouseDown={(e: any) => e.preventDefault()}
          onClick={() => sendQuickMessage(resolveMessage(msg), group.keepOpen)}
        >
          {msg.label}
        </Button>
      ))}
    </div>
  );

  return (
    <div
      className={`flex-shrink-0 bg-slate-900/70 backdrop-blur-md border-r-2 last:border-r-0 ${statusColors[caseData.status]} h-full flex flex-col ${caseData.status === 'code-red' && isFlickering ? 'code-red-flash' : 'transition-colors duration-[180ms]'} ${stationHover || scoopableHover || shipHover ? 'z-10' : ''} relative`}
      style={{
        width: `${widthPercent}%`,
        backgroundColor: isFlickering && caseData.status !== 'code-red' ? 'rgba(148, 148, 148, 0.7)' : undefined,
      }}
    >
      {/* Header */}
      <div className={`relative px-4 py-3 ${statusBgColors[caseData.status]} border-b border-slate-700 flex items-center justify-between flex-shrink-0`}>
        {!clientInChannel && (
          <img
            src={disconnectIcon}
            alt=""
            className="absolute inset-0 h-full w-auto object-cover pointer-events-none"
            style={{ opacity: 0.4 }}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <span className="font-semibold text-white truncate">CMDR {caseData.clientName}</span>
            {/* Driven by oxygenStatus rather than status, so a case that is both
                inactive and code red still shows it -- status can only hold one
                of the two and inactive wins. */}
            {caseData.oxygenStatus && (
              <AlertTriangle className="w-4 h-4 text-red-500 animate-pulse flex-shrink-0" />
            )}
            {caseData.status === 'inactive' && (
              <span className="text-xs font-semibold text-slate-300 border border-slate-500/60 bg-slate-500/20 rounded px-1.5 py-0.5 flex-shrink-0">
                INACTIVE
              </span>
            )}
          </div>
          <div className="flex flex-col mt-1 gap-0.5">
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="text-slate-300 font-semibold flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatElapsedTime(caseElapsedTime)}
              </span>
              <span>•</span>
              <span className="text-slate-400 font-medium">{getPlatformShorthand()}</span>
              <span className="text-slate-500">•</span>
              <CopyableSystem system={caseData.system} className="text-slate-400 truncate" />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
              {caseData.language && (
                <div className="text-xs text-slate-500">{caseData.language}</div>
              )}
              {caseData.landmark && (
                <div className="text-xs text-white border border-red-500/60 bg-red-500/10 rounded px-1.5 py-0.5">
                  {caseData.landmark.distance.toFixed(1)}ly from {caseData.landmark.name}
                </div>
              )}
              {caseData.scoopable === true && (
                <div className="text-xs text-white border border-red-500/60 bg-red-500/10 rounded px-1.5 py-0.5">
                  Scoopable
                </div>
              )}
              {caseData.scoopable === false && caseData.nearestScoopableStar && (
                <div
                  className="relative"
                  onMouseEnter={() => {
                    if (scoopableHideTimer.current) clearTimeout(scoopableHideTimer.current);
                    setScoopableHover(true);
                  }}
                  onMouseLeave={() => {
                    scoopableHideTimer.current = window.setTimeout(() => setScoopableHover(false), 150);
                  }}
                >
                  <div className="text-xs text-white border border-slate-500/60 bg-slate-500/10 rounded px-1.5 py-0.5 cursor-default select-none">
                    Scoopable
                  </div>
                  {scoopableHover && caseData.nearestScoopableStar && (
                    <div ref={scoopablePopupRef} style={{ left: scoopablePopupOffset }} className="absolute bottom-full mb-1 z-50 bg-slate-900 border border-slate-600 rounded shadow-xl p-1 min-w-max">
                      <button
                        className="flex items-center gap-2 w-full text-left px-2 py-1 rounded hover:bg-slate-700/50 text-xs"
                        onClick={() => navigator.clipboard.writeText(`${caseData.nearestScoopableStar!.name} (${caseData.nearestScoopableStar!.distance.toFixed(1)}ly)`)}
                      >
                        <span className="text-slate-400 font-mono flex-shrink-0">Nearest</span>
                        <span className="text-slate-300">{caseData.nearestScoopableStar.name} ({caseData.nearestScoopableStar.distance.toFixed(1)}ly)</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
              {caseData.stationOptions && caseData.stationOptions.length > 0 && (
                <div
                  className="relative"
                  onMouseEnter={() => {
                    if (stationHideTimer.current) clearTimeout(stationHideTimer.current);
                    setStationHover(true);
                  }}
                  onMouseLeave={() => {
                    stationHideTimer.current = window.setTimeout(() => setStationHover(false), 150);
                  }}
                >
                  <div className="text-xs text-white border border-slate-500/60 bg-slate-500/10 rounded px-1.5 py-0.5 cursor-default select-none">
                    Station
                  </div>
                  {stationHover && (
                    <div
                      ref={stationPopupRef}
                      style={{ left: stationPopupOffset }}
                      /* Capped so a busy system cannot run the list off the top
                         of the window; it scrolls instead. */
                      className="absolute bottom-full mb-1 z-50 bg-slate-900 border border-slate-600 rounded shadow-xl p-1 min-w-max max-h-64 overflow-y-auto"
                    >
                      {caseData.stationOptions.map((s) => {
                        // Out-of-system results are the sphere-search fallback, so
                        // the useful number is how far the detour is, not how far
                        // in-system the pad sits.
                        const label = s.systemName
                          ? `${s.name} in ${s.systemName} (${s.systemDistance?.toFixed(1)}ly)`
                          : `${s.name} (${Math.round(s.distanceToArrival).toLocaleString()}ls)`;
                        return (
                          <button
                            key={`${s.systemName ?? ''}/${s.name}`}
                            className="flex items-center gap-2 w-full text-left px-2 py-1 rounded hover:bg-slate-700/50 text-xs"
                            onClick={() => navigator.clipboard.writeText(label)}
                          >
                            <span className="text-slate-400 font-mono w-7 flex-shrink-0">
                              {isLPadStation(s.type) ? 'L' : 'S/M'}
                            </span>
                            <span className="text-slate-300">{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
          <button
            onClick={() => openEdsmPopout(caseData)}
            className="text-2xl font-bold text-orange-400 hover:underline"
            title="View EDSM system data in a new window"
          >
            {caseData.id.split('-')[1]}
          </button>
          <CodeRedTimerBadge
            timer={caseData.codeRedTimer}
            isCodeRed={caseData.status === 'code-red'}
            onManualSet={(seconds) => onSetCodeRedTimer(caseData.id, seconds)}
          />
        </div>
      </div>

      {(
        <div className="flex flex-col flex-1 min-h-0">

          {/* Rat status bar */}
          {caseData.assignedRats.length > 0 && (
            <div className="px-3 py-2 border-b border-slate-700/60 bg-slate-900/40 flex flex-col gap-1.5 flex-shrink-0">
              {caseData.assignedRats.map((rat) => {
                const nick = caseData.ratIrcNicks?.[rat] ?? rat;
                const prog = caseData.ratProgress?.[rat] ?? caseData.ratProgress?.[nick] ?? {};
                const stages: { key: keyof typeof prog; label: string }[] = [
                  { key: 'fr', label: 'FR' },
                  { key: 'wr', label: 'WR' },
                  { key: 'bc', label: 'BC' },
                ];

                const fueled = !!prog.fuel;

                // Cascade: find the highest index with an explicit positive value;
                // all stages below it are treated as positive too.
                const highestPositiveIdx = stages.reduce((max, { key }, idx) => {
                  const v = prog[key];
                  return v === '+' || v === true ? idx : max;
                }, -1);

                return (
                  <div key={rat} className={`flex items-center gap-2 text-xs rounded px-1 ${fueled ? 'bg-green-500/20' : ''}`}>
                    {/* The nick gives up space, the badges never do. It used to be
                        a fixed w-24 that could not shrink while the badges could,
                        so in a narrow column -- several cases open at once -- the
                        stages were pushed off the edge, which is the one part of
                        this row that has to stay readable. min-w-0 is what actually
                        lets it shrink; flex items refuse to go below their content
                        width without it. */}
                    <span className={`flex-1 min-w-0 truncate ${fueled ? 'text-green-300' : 'text-slate-400'}`} title={rat}>{nick}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {stages.map(({ key, label }, idx) => {
                        const val = prog[key];
                        const explicitPositive = val === '+' || val === true;
                        const cascaded = idx < highestPositiveIdx;
                        const isPositive = explicitPositive || cascaded;
                        const isNegative = val === '-' && !cascaded;
                        return (
                          <span
                            key={key}
                            className={`px-1.5 py-0.5 rounded font-mono font-semibold ${
                              isPositive
                                ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                                : isNegative
                                ? 'bg-red-500/20 text-red-400 border border-red-500/50'
                                : 'bg-slate-800 text-slate-600 border border-slate-700'
                            }`}
                          >
                            {label}{explicitPositive && val === '+' ? '+' : isNegative ? '-' : ''}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pinned jump calls + SC time */}
          {((caseData.jumpCalls && Object.keys(caseData.jumpCalls).length > 0) || caseData.scDistance !== undefined) && (() => {
            const hasSco = caseData.platform.toLowerCase().includes('horizons') || caseData.platform.toLowerCase().includes('odyssey');
            const activeShip = SCO_SHIPS.find(s => s.key === scoShip)!;
            const scBaseSecs = caseData.scDistance !== undefined
              ? distanceToSeconds(caseData.scDistance.ls, (hasSco && gravityMode !== 'nosco') ? activeShip.speed : undefined)
              : null;
            // Gravity multiplier: ~1.5× for planetary exclusion zone slowdown
            const scTotalSecs = scBaseSecs !== null ? scBaseSecs * (gravityMode === 'grav' ? 1.5 : 1) : null;
            const scEtaSecs = scTotalSecs !== null && caseData.scDistance
              ? Math.max(0, Math.floor(scTotalSecs - (Date.now() - caseData.scDistance.timestamp.getTime()) / 1000))
              : null;
            const scArrived = scEtaSecs !== null && scEtaSecs <= 0;
            const scPct = scTotalSecs && scTotalSecs > 0 && scEtaSecs !== null ? 1 - scEtaSecs / scTotalSecs : 1;
            const scHue = Math.round(scPct * 120);
            const scColor = `hsl(${scHue}, 80%, 55%)`;
            const scMins = scEtaSecs !== null ? Math.floor(scEtaSecs / 60) : 0;
            const scSecs = scEtaSecs !== null ? scEtaSecs % 60 : 0;
            const scCountdown = `${scMins}:${scSecs.toString().padStart(2, '0')}`;
            return (
              <div className="px-3 py-1.5 border-b border-slate-700/60 bg-slate-800/30 flex items-center gap-3 flex-wrap flex-shrink-0">
                {caseData.jumpCalls && Object.keys(caseData.jumpCalls).length > 0 && (
                  <>
                    <span className="text-xs text-slate-500 font-semibold flex-shrink-0">Jumps:</span>
                    {Object.entries(caseData.jumpCalls)
                      .sort((a, b) => a[1].jumps - b[1].jumps)
                      .map(([nick, call]) => {
                        const totalSecs = call.jumps * 60;
                        const etaSecs = Math.max(0, Math.floor(totalSecs - (Date.now() - call.timestamp.getTime()) / 1000));
                        const arrived = etaSecs <= 0;
                        const mins = Math.floor(etaSecs / 60);
                        const secs = etaSecs % 60;
                        const countdownStr = `${mins}:${secs.toString().padStart(2, '0')}`;
                        const pct = totalSecs > 0 ? 1 - etaSecs / totalSecs : 1;
                        const hue = Math.round(pct * 120);
                        const timerColor = `hsl(${hue}, 80%, 55%)`;
                        return (
                          <span key={nick} className="text-xs" title={call.text}>
                            <span className="text-slate-400">{nick}</span>
                            <span className="text-orange-400 font-bold ml-1">{call.jumps}j</span>
                            {!arrived && (
                              <span className="ml-1 font-mono" style={{ color: timerColor }}>
                                ({countdownStr})
                              </span>
                            )}
                          </span>
                        );
                      })}
                  </>
                )}
                {scEtaSecs !== null && (
                  <div className="ml-auto flex-shrink-0 flex items-center gap-1.5">
                    {/* Gravity toggle */}
                    <button
                      onClick={() => setGravityMode(g => g === 'off' ? 'grav' : g === 'grav' ? 'nosco' : 'off')}
                      title={gravityMode === 'grav' ? 'Gravity ×1.5 active' : gravityMode === 'nosco' ? 'No SCO — using sub-light speed' : 'Toggle gravity / SCO mode'}
                      className={`text-xs border rounded px-1.5 py-0.5 select-none transition-colors ${
                        gravityMode === 'grav'  ? 'border-amber-500/70 bg-amber-500/15 text-amber-400' :
                        gravityMode === 'nosco' ? 'border-blue-500/70 bg-blue-500/15 text-blue-400' :
                                                  'border-slate-600 bg-slate-700/30 text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {gravityMode === 'grav' ? '⚖ Grav' : gravityMode === 'nosco' ? '✕ SCO' : '⚖ Grav'}
                    </button>

                    {/* SC countdown chip */}
                    <div className="relative"
                      onMouseEnter={() => { if (shipHideTimer.current) clearTimeout(shipHideTimer.current); if (hasSco) setShipHover(true); }}
                      onMouseLeave={() => { shipHideTimer.current = window.setTimeout(() => setShipHover(false), 150); }}
                    >
                      <div className="text-xs text-white border border-slate-500/60 bg-slate-500/10 rounded px-1.5 py-0.5 cursor-default select-none flex items-center gap-1.5">
                        <span className="text-slate-400">SC</span>
                        {!scArrived
                          ? <span className="font-mono" style={{ color: scColor }}>{scCountdown}</span>
                          : <span className="font-mono text-green-400">arrived</span>}
                        {hasSco && <span className="text-slate-500">· {activeShip.label} ▾</span>}
                      </div>
                      {shipHover && hasSco && (
                        <div ref={shipPopupRef} style={{ left: shipPopupOffset }} className="absolute bottom-full mb-1 z-50 bg-slate-900 border border-slate-600 rounded shadow-xl p-1 min-w-max">
                          {SCO_SHIPS.map((ship) => (
                            <button
                              key={ship.key}
                              className={`flex items-center gap-2 w-full text-left px-2 py-1 rounded text-xs ${scoShip === ship.key ? 'bg-slate-700/70 text-white' : 'hover:bg-slate-700/50 text-slate-300'}`}
                              onClick={() => { setScoShip(ship.key); setShipHover(false); }}
                            >
                              <span className="font-medium">{ship.label}</span>
                              <span className="text-slate-500">{ship.speed.toLocaleString()} ls/s</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Case notes (!inject / !grab) */}
          {caseData.injections.length > 0 && (
            <div className="border-b border-slate-700/60 bg-amber-500/5 flex-shrink-0">
              <button
                onClick={() => setNotesCollapsed(c => !c)}
                className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left group"
              >
                <span className="text-xs font-semibold text-amber-500/80 uppercase tracking-wider flex-1">
                  Quotes <span className="text-slate-600 normal-case">({caseData.injections.length})</span>
                </span>
                <ChevronDown className={`w-3 h-3 text-slate-600 group-hover:text-slate-400 transition-transform ${notesCollapsed ? '' : 'rotate-180'}`} />
              </button>
              {!notesCollapsed && (
                <div className="px-3 pb-2 max-h-40 overflow-y-auto">
                  <CaseNotes
                    injections={caseData.injections}
                    compact
                    showIndex
                    onEditQuote={(index, text) => setEditingQuote({ index, text })}
                  />
                </div>
              )}
            </div>
          )}

          {/* Collapsed by default: it costs a request when opened, and the
              answer is context rather than something needed on every case. */}
          <ClientHistory
            clientName={caseData.clientName}
            ircNick={caseData.ircNick}
            currentApiId={caseData.apiId}
          />

          {/* Messages */}
          <div
            className="flex-1 overflow-y-auto p-4 min-h-0"
            ref={chatAreaRef}
            onClick={handleChatAreaClick}
          >
            <div className="space-y-3">
              {caseData.messages.map((msg) => {
                // Worked out once per message: in nick mode it colours the
                // name, in bubble mode the background, and it is the same
                // answer either way.
                const role = msg.isSystem ? null : classifyMessageRole(msg.sender, caseData);
                return (
                <div
                  key={msg.id}
                  className={`${
                    msg.isSystem
                      ? 'text-center text-xs text-slate-500 italic'
                      : 'backdrop-blur-sm rounded p-2'
                  }`}
                  style={
                    role === null
                      ? undefined
                      : {
                          backgroundColor: nickMode
                            ? colorSettings.neutralBubble
                            : colorSettings.bubble[role],
                        }
                  }
                >
                  {!msg.isSystem && (
                    <>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs font-semibold ${nickMode ? '' : 'text-orange-400'}`}
                            style={
                              nickMode && role !== null
                                ? { color: colorSettings.nick[role] }
                                : undefined
                            }
                          >
                            {msg.sender}
                          </span>
                        </div>
                        <span className="text-xs text-slate-500">
                          {formatTime(msg.timestamp)}
                        </span>
                      </div>
                      <p
                        className={`text-sm break-words ${msg.isNotice ? 'italic' : ''}`}
                        style={role === null ? undefined : { color: msg.isNotice ? colorSettings.translation[role] : colorSettings.text[role] }}
                      >
                        {msg.isNotice ? `⟫ ${msg.text}` : msg.text}
                      </p>
                      {msg.translation && (
                        <p className="text-sm break-words italic mt-1" style={role === null ? undefined : { color: colorSettings.translation[role] }}>⟫ {msg.translation}</p>
                      )}
                    </>
                  )}
                  {msg.isSystem && (
                    <span>
                      {msg.text} <span className="text-slate-600">({formatTime(msg.timestamp)})</span>
                    </span>
                  )}
                </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Bottom Bar with Message Input and Controls */}
          <div className="p-3 border-t border-slate-700 flex-shrink-0 bg-slate-900/50 backdrop-blur-sm">
            {/* Activity Timer and Action Buttons */}
            <div className="mb-2 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <Clock className="w-3 h-3 text-slate-400" />
                <span className="text-slate-400">Last activity:</span>
                <span 
                  className={`font-semibold ${
                    activityElapsedTime >= 600 
                      ? 'text-red-500' 
                      : activityElapsedTime >= 120 
                        ? 'text-red-300' 
                        : 'text-slate-300'
                  }`}
                >
                  {activityElapsedTime >= 600 ? '>10:00' : formatElapsedTime(activityElapsedTime)}
                </span>
              </div>

              {/* Combined menu button - always shown */}
              <div>
                <Popover open={combinedPopoverOpen} onOpenChange={setCombinedPopoverOpen}>
                  <PopoverTrigger className="h-7 px-2 bg-slate-800 border border-slate-600 text-white hover:bg-slate-700 flex items-center gap-1 rounded cursor-pointer text-xs">
                    <MoreVertical className="w-3 h-3" />
                    Menu
                  </PopoverTrigger>
                  <PopoverContent 
                    className="w-64 bg-slate-800/90 backdrop-blur-md border-slate-700 p-3"
                    align="end"
                    side="top"
                  >
                    <div className="space-y-4">
                      {/* Rats Section */}
                      <div>
                        <h3 className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          Rats ({caseData.assignedRats.length})
                        </h3>
                        <div className="space-y-1">
                          {caseData.assignedRats.length === 0 ? (
                            <div className="text-xs text-slate-500 italic">No rats assigned</div>
                          ) : (
                            caseData.assignedRats.map((rat, idx) => (
                              <Popover
                                key={idx}
                                open={openRatMenuId === `${caseData.id}-${rat}`}
                                onOpenChange={(open) => setOpenRatMenuId(open ? `${caseData.id}-${rat}` : null)}
                              >
                                <PopoverTrigger asChild>
                                  <button
                                    className="w-full text-xs bg-slate-900 rounded px-2 py-1 text-slate-300 hover:bg-slate-800 transition-colors flex items-center justify-between group cursor-pointer"
                                  >
                                    <span>
                                      {caseData.ratIrcNicks?.[rat] ?? rat}
                                    </span>
                                    <ChevronDown className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent 
                                  className="w-48 p-1 bg-slate-900 border-slate-700"
                                  align="start"
                                  side="right"
                                >
                                  <div className="flex flex-col gap-1">
                                    <button
                                      className="flex items-center gap-2 px-3 py-2 text-xs text-yellow-400 hover:bg-slate-800 rounded transition-colors"
                                      onClick={() => {
                                        onAddMessage(caseData.id, `!standdown ${caseNumber} ${getRatIrcNick(rat)}`, '#ratchat');
                                        setOpenRatMenuId(null);
                                      }}
                                    >
                                      <X className="w-3 h-3" />
                                      Remove
                                    </button>
                                    <button
                                      className="flex items-center gap-2 px-3 py-2 text-xs text-green-400 hover:bg-slate-800 rounded transition-colors"
                                      onClick={() => {
                                        onAddMessage(caseData.id, `!close ${caseNumber} ${getRatIrcNick(rat)}`, '#ratchat');
                                        setOpenRatMenuId(null);
                                      }}
                                    >
                                      <Zap className="w-3 h-3" />
                                      Close
                                    </button>
                                    <button
                                      className="flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-slate-800 rounded transition-colors"
                                      onClick={() => {
                                        onAddMessage(caseData.id, `!close -p ${caseNumber} ${getRatIrcNick(rat)}`, '#ratchat');
                                        setOpenRatMenuId(null);
                                      }}
                                    >
                                      <Zap className="w-3 h-3" />
                                      Close -p
                                    </button>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Language Section */}
                      <div>
                        <h3 className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1">
                          <Languages className="w-3 h-3" />
                          Language{caseData.language ? ` - ${new Intl.DisplayNames(['en'], { type: 'language' }).of(caseData.language)}` : ''}
                        </h3>
                        <div className="space-y-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className={`w-full text-xs h-8 bg-slate-900 border-slate-600 text-white hover:bg-slate-700 ${translateEnabled ? 'bg-orange-600/20 border-orange-500' : ''}`}
                            onClick={() => { setTranslateEnabled(!translateEnabled); setDeeplEnabled(false); setLangblyEnabled(false); }}
                          >
                            /tr {translateEnabled ? '(ON)' : '(OFF)'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className={`w-full text-xs h-8 bg-slate-900 border-slate-600 text-white hover:bg-slate-700 ${deeplEnabled ? 'bg-blue-600/20 border-blue-500' : ''}`}
                            onClick={() => {
                              if (!getDeepLApiKey()) {
                                setShowApiKeyInput(true);
                              } else {
                                setDeeplEnabled(!deeplEnabled);
                                setTranslateEnabled(false);
                                setLangblyEnabled(false);
                              }
                            }}
                          >
                            DeepL {deeplEnabled ? '(ON)' : '(OFF)'}
                          </Button>
                          {deeplEnabled && deeplUsage && (
                            <div className="mt-1 px-0.5">
                              <div className="w-full bg-slate-700 rounded-full h-1.5">
                                <div
                                  className="bg-blue-500 h-1.5 rounded-full transition-all"
                                  style={{ width: `${Math.min(100, (deeplUsage.count / deeplUsage.limit) * 100).toFixed(1)}%` }}
                                />
                              </div>
                              <p className="text-xs text-slate-500 text-right mt-0.5">
                                {((deeplUsage.count / deeplUsage.limit) * 100).toFixed(1)}% used
                              </p>
                            </div>
                          )}
                          {showApiKeyInput && (
                            <div className="flex gap-1 mt-1">
                              <Input
                                className="h-7 text-xs bg-slate-900 border-slate-600 text-white"
                                placeholder="DeepL API key"
                                value={deeplApiKey}
                                onChange={(e) => setDeeplApiKeyState(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && deeplApiKey.trim()) {
                                    setDeepLApiKey(deeplApiKey.trim());
                                    setShowApiKeyInput(false);
                                    setDeeplEnabled(true);
                                    setTranslateEnabled(false);
                                    setLangblyEnabled(false);
                                  }
                                }}
                              />
                              <Button
                                size="sm"
                                className="h-7 px-2 text-xs bg-blue-600 hover:bg-blue-700 text-white shrink-0"
                                onClick={() => {
                                  if (deeplApiKey.trim()) {
                                    setDeepLApiKey(deeplApiKey.trim());
                                    setShowApiKeyInput(false);
                                    setDeeplEnabled(true);
                                    setTranslateEnabled(false);
                                    setLangblyEnabled(false);
                                  }
                                }}
                              >
                                Save
                              </Button>
                            </div>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className={`w-full text-xs h-8 bg-slate-900 border-slate-600 text-white hover:bg-slate-700 ${langblyEnabled ? 'bg-orange-600/20 border-orange-400' : ''}`}
                            onClick={() => {
                              if (!getLangblyApiKey()) {
                                setShowLangblyKeyInput(true);
                              } else {
                                setLangblyEnabled(!langblyEnabled);
                                setTranslateEnabled(false);
                                setDeeplEnabled(false);
                              }
                            }}
                          >
                            Langbly {langblyEnabled ? '(ON)' : '(OFF)'}
                          </Button>
                          {showLangblyKeyInput && (
                            <div className="flex gap-1 mt-1">
                              <Input
                                className="h-7 text-xs bg-slate-900 border-slate-600 text-white"
                                placeholder="Langbly API key"
                                value={langblyApiKey}
                                onChange={(e) => setLangblyApiKeyState(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && langblyApiKey.trim()) {
                                    setLangblyApiKey(langblyApiKey.trim());
                                    setShowLangblyKeyInput(false);
                                    setLangblyEnabled(true);
                                    setTranslateEnabled(false);
                                    setDeeplEnabled(false);
                                  }
                                }}
                              />
                              <Button
                                size="sm"
                                className="h-7 px-2 text-xs bg-orange-600 hover:bg-orange-700 text-white shrink-0"
                                onClick={() => {
                                  if (langblyApiKey.trim()) {
                                    setLangblyApiKey(langblyApiKey.trim());
                                    setShowLangblyKeyInput(false);
                                    setLangblyEnabled(true);
                                    setTranslateEnabled(false);
                                    setDeeplEnabled(false);
                                  }
                                }}
                              >
                                Save
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Quick Message Section */}
                      <div>
                        <h3 className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1">
                          <Zap className="w-3 h-3" />
                          Quick Message
                        </h3>
                        {buttonGroups.length === 0 ? (
                          <div className="text-xs text-slate-600 italic">No buttons configured.</div>
                        ) : (
                          <div className="space-y-1">
                            {buttonGroups.map((group, i) => (
                              <Popover
                                key={i}
                                open={rootPopoverOpen[i] || false}
                                onOpenChange={(open) => setRootPopoverOpen(prev => ({ ...prev, [i]: open }))}
                              >
                                <PopoverTrigger className="w-full text-xs h-8 bg-slate-900 border border-slate-600 text-white hover:bg-slate-700 rounded px-2">
                                  {'>'}{group.label}{'<'}
                                </PopoverTrigger>
                                <PopoverContent className="w-56 bg-slate-800/90 backdrop-blur-md border-slate-700 p-2" side="right" align="start">
                                  {renderGroupContent(group, `r${i}`)}
                                </PopoverContent>
                              </Popover>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Message Input */}
            <div className="flex gap-2">
              <Input
                ref={messageInputRef}
                value={messageInput}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={ircConnected ? 'Type message... (Tab to complete nick)' : 'IRC disconnected'}
                disabled={!ircConnected}
                className="flex-1 bg-slate-800/70 backdrop-blur-sm border-slate-700 text-white placeholder:text-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <Button
                onClick={handleSendMessage}
                onMouseDown={(e) => e.preventDefault()}
                size="icon"
                disabled={!ircConnected}
                className="bg-orange-600 hover:bg-orange-700 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {editingQuote && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setEditingQuote(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-lg p-6 w-full max-w-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-orange-500">Edit Quote #{editingQuote.index}</h2>
              <button onClick={() => setEditingQuote(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <textarea
              autoFocus
              value={editingQuote.text}
              onChange={(e) => setEditingQuote({ index: editingQuote.index, text: e.target.value })}
              rows={4}
              className="w-full bg-slate-800/70 border border-slate-700 rounded p-2 text-sm text-white placeholder:text-slate-500 resize-none"
            />
            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="ghost"
                onClick={() => setEditingQuote(null)}
                className="text-slate-300 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  onAddMessage(caseData.id, `!sub ${caseNumber} ${editingQuote.index} ${editingQuote.text}`, '#ratchat');
                  setEditingQuote(null);
                }}
                disabled={!ircConnected || !editingQuote.text.trim()}
                className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Submit
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

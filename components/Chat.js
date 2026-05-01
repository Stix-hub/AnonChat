import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const MAX_CHARS = 100
const RATE_LIMIT_MS = 2000
const AVATAR_COLORS = ['#6366f1','#ec4899','#14b8a6','#f59e0b','#10b981','#8b5cf6','#f43f5e','#06b6d4']

function isLink(text) {
  return /https?:\/\/|www\.|\.com|\.net|\.org|\.br/i.test(text)
}

function randomColor() {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination)
    o.frequency.value = 520
    g.gain.setValueAtTime(0.1, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
    o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.3)
  } catch {}
}

export default function Chat({ userId }) {
  const [screen, setScreen] = useState('connect')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [roomId, setRoomId] = useState(null)
  const [strangerTyping, setStrangerTyping] = useState(false)
  const [avatarColor] = useState(randomColor)
  const [mounted, setMounted] = useState(false)
  const lastSentRef = useRef(0)
  const typingTimeoutRef = useRef(null)
  const messagesEndRef = useRef(null)
  const channelRef = useRef(null)
  const typingChannelRef = useRef(null)

  useEffect(() => { setTimeout(() => setMounted(true), 50) }, [])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  function addSystem(text) {
    setMessages(m => [...m, { type: 'system', text }])
  }

  async function startSearch() {
    setScreen('searching')
    setMessages([])
    await supabase.from('queue').delete().eq('id', userId)
    const { data: others } = await supabase.from('queue').select('id').neq('id', userId).limit(1)

    if (others && others.length > 0) {
      const stranger = others[0]
      await supabase.from('queue').delete().eq('id', stranger.id)
      const { data: room } = await supabase.from('rooms').insert({ user1: userId, user2: stranger.id }).select().single()
      if (room) connectRoom(room)
    } else {
      await supabase.from('queue').insert({ id: userId })
      const sub = supabase.channel(`queue-watch-${userId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rooms' }, (payload) => {
          const room = payload.new
          if (room.user1 === userId || room.user2 === userId) {
            connectRoom(room); sub.unsubscribe()
          }
        }).subscribe()
      channelRef.current = sub
    }
  }

  function connectRoom(room) {
    setRoomId(room.id)
    setScreen('chat')
    addSystem('você está conectado com um estranho.')
    subscribeToRoom(room.id)
  }

  function subscribeToRoom(rid) {
    const typingCh = supabase.channel(`typing-${rid}`)
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload.userId !== userId) {
          setStrangerTyping(true)
          clearTimeout(typingTimeoutRef.current)
          typingTimeoutRef.current = setTimeout(() => setStrangerTyping(false), 2000)
        }
      }).subscribe()
    typingChannelRef.current = typingCh

    const sub = supabase.channel(`room-${rid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${rid}` }, (payload) => {
        const msg = payload.new
        if (msg.sender !== userId) {
          setStrangerTyping(false)
          setMessages(m => [...m, { type: 'them', text: msg.content }])
          playBeep()
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${rid}` }, (payload) => {
        if (!payload.new.active) addSystem('o estranho desconectou.')
      }).subscribe()
    channelRef.current = sub
  }

  async function cancelSearch() {
    await supabase.from('queue').delete().eq('id', userId)
    if (channelRef.current) channelRef.current.unsubscribe()
    setScreen('connect')
  }

  async function nextStranger() {
    if (roomId) await supabase.from('rooms').update({ active: false }).eq('id', roomId)
    if (channelRef.current) channelRef.current.unsubscribe()
    if (typingChannelRef.current) typingChannelRef.current.unsubscribe()
    setRoomId(null)
    startSearch()
  }

  async function sendMessage() {
    const text = input.trim()
    if (!text || !roomId) return
    if (isLink(text)) { addSystem('links não são permitidos.'); setInput(''); return }
    const now = Date.now()
    if (now - lastSentRef.current < RATE_LIMIT_MS) {
      addSystem(`aguarde ${((RATE_LIMIT_MS - (now - lastSentRef.current)) / 1000).toFixed(1)}s.`)
      return
    }
    lastSentRef.current = now
    setMessages(m => [...m, { type: 'me', text }])
    setInput('')
    await supabase.from('messages').insert({ room_id: roomId, sender: userId, content: text })
  }

  function handleInput(e) {
    setInput(e.target.value.slice(0, MAX_CHARS))
    if (roomId && typingChannelRef.current) {
      typingChannelRef.current.send({ type: 'broadcast', event: 'typing', payload: { userId } })
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const remaining = MAX_CHARS - input.length

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        html,body,#__next{height:100%;background:#0a0a0f;}
        #__next{display:flex;align-items:center;justify-content:center;}
        .app{font-family:'DM Sans',sans-serif;background:#0a0a0f;width:100%;max-width:640px;height:100dvh;max-height:700px;display:flex;flex-direction:column;color:#e8e8f0;border-radius:16px;overflow:hidden;position:relative;border:1px solid rgba(99,102,241,0.15);}
        @media(max-width:640px){.app{border-radius:0;border:none;max-height:100dvh;}}
        .grid-bg{position:absolute;inset:0;background-image:linear-gradient(rgba(99,102,241,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,0.03) 1px,transparent 1px);background-size:40px 40px;pointer-events:none;}
        .header{display:flex;align-items:center;padding:16px 20px;border-bottom:1px solid rgba(99,102,241,0.15);position:relative;z-index:1;flex-shrink:0;}
        .logo{font-family:'Space Mono',monospace;font-size:18px;font-weight:700;color:#818cf8;}
        .logo span{color:#e8e8f0;}
        .connect-screen{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 24px;gap:24px;position:relative;z-index:1;opacity:0;transform:translateY(20px);transition:opacity 0.6s ease,transform 0.6s ease;}
        .connect-screen.visible{opacity:1;transform:translateY(0);}
        .hero-title{font-size:clamp(32px,8vw,48px);font-weight:300;text-align:center;line-height:1.15;color:#e8e8f0;letter-spacing:-1px;opacity:0;transform:translateY(10px);transition:opacity 0.5s ease 0.2s,transform 0.5s ease 0.2s;}
        .connect-screen.visible .hero-title{opacity:1;transform:translateY(0);}
        .hero-title strong{font-weight:500;color:#818cf8;}
        .hero-sub{font-size:13px;color:rgba(232,232,240,0.35);font-family:'Space Mono',monospace;opacity:0;transition:opacity 0.5s ease 0.35s;}
        .connect-screen.visible .hero-sub{opacity:1;}
        .connect-btn{background:#6366f1;color:#fff;border:none;padding:14px 44px;border-radius:12px;font-family:'DM Sans',sans-serif;font-size:16px;font-weight:500;cursor:pointer;opacity:0;transform:translateY(8px);transition:opacity 0.5s ease 0.45s,transform 0.5s ease 0.45s,background 0.2s;}
        .connect-screen.visible .connect-btn{opacity:1;transform:translateY(0);}
        .connect-btn:hover{background:#818cf8;}
        .connect-btn:active{transform:scale(0.97)!important;}
        .searching-screen{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;position:relative;z-index:1;}
        .spinner{width:44px;height:44px;border:2px solid rgba(99,102,241,0.1);border-top-color:#6366f1;border-radius:50%;animation:spin 0.8s linear infinite;}
        @keyframes spin{to{transform:rotate(360deg);}}
        .searching-text{font-family:'Space Mono',monospace;font-size:13px;color:rgba(232,232,240,0.35);}
        .cancel-btn{background:transparent;border:1px solid rgba(232,232,240,0.1);color:rgba(232,232,240,0.3);padding:8px 20px;border-radius:8px;font-family:'Space Mono',monospace;font-size:11px;cursor:pointer;}
        .chat-screen{flex:1;display:flex;flex-direction:column;position:relative;z-index:1;min-height:0;}
        .chat-top{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid rgba(99,102,241,0.1);background:rgba(99,102,241,0.04);flex-shrink:0;}
        .stranger-info{display:flex;align-items:center;gap:10px;}
        .avatar{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;color:#fff;font-family:'Space Mono',monospace;font-weight:700;flex-shrink:0;}
        .stranger-name{font-size:13px;font-weight:500;}
        .stranger-status{font-size:11px;color:rgba(232,232,240,0.35);font-family:'Space Mono',monospace;}
        .next-btn{background:transparent;border:1px solid rgba(232,99,99,0.25);color:rgba(232,99,99,0.6);padding:6px 14px;border-radius:8px;font-family:'Space Mono',monospace;font-size:11px;cursor:pointer;white-space:nowrap;}
        .messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;-webkit-overflow-scrolling:touch;}
        .system-msg{text-align:center;font-size:11px;color:rgba(232,232,240,0.22);font-family:'Space Mono',monospace;}
        .msg-wrap{display:flex;flex-direction:column;}
        .msg-wrap.me{align-items:flex-end;}
        .msg-wrap.them{align-items:flex-start;}
        .msg-label{font-size:10px;font-family:'Space Mono',monospace;opacity:0.35;margin-bottom:3px;}
        .msg{max-width:80%;padding:10px 14px;border-radius:12px;font-size:14px;line-height:1.5;animation:fadeUp 0.2s ease;word-break:break-word;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(5px);}to{opacity:1;transform:translateY(0);}}
        .msg.them{background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.15);border-bottom-left-radius:4px;}
        .msg.me{background:#6366f1;color:#fff;border-bottom-right-radius:4px;}
        .typing-indicator{display:flex;align-items:center;gap:4px;padding:10px 14px;background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.12);border-radius:12px;border-bottom-left-radius:4px;width:fit-content;animation:fadeUp 0.2s ease;}
        .typing-dot{width:6px;height:6px;border-radius:50%;background:#818cf8;animation:bounce 1.2s infinite;}
        .typing-dot:nth-child(2){animation-delay:0.2s;}
        .typing-dot:nth-child(3){animation-delay:0.4s;}
        @keyframes bounce{0%,60%,100%{transform:translateY(0);}30%{transform:translateY(-6px);}}
        .chat-input-area{padding:10px 14px;border-top:1px solid rgba(99,102,241,0.1);display:flex;gap:8px;align-items:flex-end;flex-shrink:0;}
        .input-wrap{flex:1;background:rgba(99,102,241,0.05);border:1px solid rgba(99,102,241,0.15);border-radius:10px;display:flex;align-items:center;padding:0 10px;}
        .input-wrap:focus-within{border-color:rgba(99,102,241,0.35);}
        .chat-input{flex:1;background:transparent;border:none;outline:none;color:#e8e8f0;font-family:'DM Sans',sans-serif;font-size:15px;padding:10px 0;resize:none;max-height:80px;-webkit-appearance:none;}
        .chat-input::placeholder{color:rgba(232,232,240,0.2);}
        .char-count{font-size:10px;font-family:'Space Mono',monospace;color:rgba(232,232,240,0.18);min-width:26px;text-align:right;}
        .char-count.warn{color:rgba(239,99,99,0.55);}
        .send-btn{width:40px;height:40px;min-width:40px;border-radius:10px;background:#6366f1;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;}
        .send-btn:active{transform:scale(0.95);}
        .send-btn svg{width:15px;height:15px;}
      `}</style>

      <div className="app">
        <div className="grid-bg" />
        <header className="header">
          <div className="logo">chat<span>anon</span></div>
        </header>

        {screen === 'connect' && (
          <div className={`connect-screen ${mounted ? 'visible' : ''}`}>
            <div className="hero-title">fale com<br /><strong>estranhos.</strong></div>
            <div className="hero-sub">// anônimo. sem cadastro. sem rastro.</div>
            <button className="connect-btn" onClick={startSearch}>conectar agora</button>
          </div>
        )}

        {screen === 'searching' && (
          <div className="searching-screen">
            <div className="spinner" />
            <div className="searching-text">procurando alguém...</div>
            <button className="cancel-btn" onClick={cancelSearch}>cancelar</button>
          </div>
        )}

        {screen === 'chat' && (
          <div className="chat-screen">
            <div className="chat-top">
              <div className="stranger-info">
                <div className="avatar" style={{ background: avatarColor }}>?</div>
                <div>
                  <div className="stranger-name">estranho</div>
                  <div className="stranger-status">{strangerTyping ? 'digitando...' : 'conectado'}</div>
                </div>
              </div>
              <button className="next-btn" onClick={nextStranger}>próximo →</button>
            </div>

            <div className="messages">
              {messages.map((msg, i) => (
                msg.type === 'system'
                  ? <div key={i} className="system-msg">{msg.text}</div>
                  : (
                    <div key={i} className={`msg-wrap ${msg.type}`}>
                      <div className="msg-label">{msg.type === 'me' ? 'você' : 'estranho'}</div>
                      <div className={`msg ${msg.type}`}>{msg.text}</div>
                    </div>
                  )
              ))}
              {strangerTyping && (
                <div className="typing-indicator">
                  <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-area">
              <div className="input-wrap">
                <textarea
                  className="chat-input"
                  value={input}
                  onChange={handleInput}
                  onKeyDown={handleKey}
                  placeholder="digite uma mensagem..."
                  rows={1}
                />
                <span className={`char-count ${remaining <= 20 ? 'warn' : ''}`}>{remaining}</span>
              </div>
              <button className="send-btn" onClick={sendMessage}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
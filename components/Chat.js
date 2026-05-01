import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const MAX_CHARS = 100
const RATE_LIMIT_MS = 2000

function isLink(text) {
  return /https?:\/\/|www\.|\.com|\.net|\.org|\.br/i.test(text)
}

export default function Chat({ userId }) {
  const [screen, setScreen] = useState('connect')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [roomId, setRoomId] = useState(null)
  const [strangerTyping, setStrangerTyping] = useState(false)
  const lastSentRef = useRef(0)
  const messagesEndRef = useRef(null)
  const channelRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function addSystem(text) {
    setMessages(m => [...m, { type: 'system', text }])
  }

  async function startSearch() {
    setScreen('searching')
    setMessages([])

    await supabase.from('queue').delete().eq('id', userId)

    const { data: others } = await supabase
      .from('queue')
      .select('id')
      .neq('id', userId)
      .limit(1)

    if (others && others.length > 0) {
      const stranger = others[0]
      await supabase.from('queue').delete().eq('id', stranger.id)

      const { data: room } = await supabase
        .from('rooms')
        .insert({ user1: userId, user2: stranger.id })
        .select()
        .single()

      if (room) {
        setRoomId(room.id)
        setScreen('chat')
        addSystem('você está conectado com um estranho.')
        subscribeToRoom(room.id)
      }
    } else {
      await supabase.from('queue').insert({ id: userId })

      const sub = supabase
        .channel(`queue-watch-${userId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'rooms',
        }, async (payload) => {
          const room = payload.new
          if (room.user1 === userId || room.user2 === userId) {
            setRoomId(room.id)
            setScreen('chat')
            addSystem('você está conectado com um estranho.')
            subscribeToRoom(room.id)
            sub.unsubscribe()
          }
        })
        .subscribe()

      channelRef.current = sub
    }
  }

  function subscribeToRoom(rid) {
    const sub = supabase
      .channel(`room-${rid}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `room_id=eq.${rid}`,
      }, (payload) => {
        const msg = payload.new
        if (msg.sender !== userId) {
          setStrangerTyping(false)
          setMessages(m => [...m, { type: 'them', text: msg.content }])
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'rooms',
        filter: `id=eq.${rid}`,
      }, (payload) => {
        if (!payload.new.active) {
          addSystem('o estranho desconectou.')
        }
      })
      .subscribe()

    channelRef.current = sub
  }

  async function cancelSearch() {
    await supabase.from('queue').delete().eq('id', userId)
    if (channelRef.current) channelRef.current.unsubscribe()
    setScreen('connect')
  }

  async function nextStranger() {
    if (roomId) {
      await supabase.from('rooms').update({ active: false }).eq('id', roomId)
    }
    if (channelRef.current) channelRef.current.unsubscribe()
    setRoomId(null)
    startSearch()
  }

  async function sendMessage() {
    const text = input.trim()
    if (!text || !roomId) return

    if (isLink(text)) {
      addSystem('links não são permitidos.')
      setInput('')
      return
    }

    const now = Date.now()
    if (now - lastSentRef.current < RATE_LIMIT_MS) {
      const s = ((RATE_LIMIT_MS - (now - lastSentRef.current)) / 1000).toFixed(1)
      addSystem(`aguarde ${s}s antes de enviar.`)
      return
    }

    lastSentRef.current = now
    setMessages(m => [...m, { type: 'me', text }])
    setInput('')

    await supabase.from('messages').insert({
      room_id: roomId,
      sender: userId,
      content: text,
    })
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const remaining = MAX_CHARS - input.length

  return (
    <div className="app">
      <div className="grid-bg" />

      <header className="header">
        <div className="logo">chat<span>anon</span></div>
      </header>

      {screen === 'connect' && (
        <div className="connect-screen">
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
              <div className="avatar">?</div>
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
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-area">
            <div className="input-wrap">
              <textarea
                className="chat-input"
                value={input}
                onChange={e => setInput(e.target.value.slice(0, MAX_CHARS))}
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
  )
}

import { useEffect, useState } from 'react'
import Chat from '../components/Chat'
import Head from 'next/head'

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

export default function Home() {
  const [userId, setUserId] = useState(null)

  useEffect(() => {
    let id = sessionStorage.getItem('chatanon_uid')
    if (!id) {
      id = generateUUID()
      sessionStorage.setItem('chatanon_uid', id)
    }
    setUserId(id)
  }, [])

  if (!userId) return null

  return (
    <>
      <Head>
        <title>chatanon</title>
        <meta name="description" content="Chat anônimo em tempo real" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="true" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      </Head>
      <Chat userId={userId} />
    </>
  )
}
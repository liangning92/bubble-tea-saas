import { useEffect, useRef, useState } from 'react'

type Track = { url: string; title?: string }

export function TvIdleMusic({ tracks, volume, active, resolveUrl }: {
  tracks: Track[]; volume: number; active: boolean; resolveUrl: (url: string) => string
}) {
  const audio = useRef<HTMLAudioElement>(null)
  const [index, setIndex] = useState(0)
  const [blocked, setBlocked] = useState(false)
  const [failed, setFailed] = useState(false)
  const failures = useRef(new Set<number>())
  const playlistKey = JSON.stringify(tracks.map(track => track.url))
  const source = tracks.length ? resolveUrl(tracks[index % tracks.length].url) : ''

  useEffect(() => { setIndex(0); failures.current.clear(); setFailed(false) }, [playlistKey])
  useEffect(() => {
    const element = audio.current
    if (!element) return
    element.volume = volume
  }, [volume, source])
  useEffect(() => {
    const element = audio.current
    if (!element || !active || !source || failed) { element?.pause(); return }
    let cancelled = false
    element.play().then(() => { if (!cancelled) setBlocked(false) }).catch(error => {
      if (!cancelled && error.name === 'NotAllowedError') setBlocked(true)
    })
    return () => { cancelled = true; element.pause() }
  }, [active, source, failed])

  const next = () => setIndex(value => (value + 1) % Math.max(1, tracks.length))
  const skipFailed = () => {
    failures.current.add(index % Math.max(1, tracks.length))
    if (failures.current.size >= tracks.length) { setFailed(true); return }
    next()
  }
  const resume = () => {
    failures.current.clear(); setFailed(false)
    const element = audio.current
    if (!element) return
    if (failed) element.load()
    element.play().then(() => setBlocked(false)).catch(() => setBlocked(true))
  }

  return <>
    <audio ref={audio} data-testid="tv-idle-music" src={source || undefined} preload="none" onEnded={() => { if (!active) return; failures.current.clear(); next(); if (tracks.length === 1 && audio.current) { audio.current.currentTime = 0; void audio.current.play().catch(() => setBlocked(true)) } }} onError={skipFailed} />
    {active && (blocked || failed) && <button onClick={resume} className="absolute bottom-16 right-6 z-30 rounded-xl bg-slate-800 px-5 py-3 text-white border border-slate-500 shadow-xl">
      {failed ? '音乐加载失败，点击重试 / Coba lagi' : '点击开启音乐 / Tap to play music / Putar musik'}
    </button>}
  </>
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { getApiBaseUrl, getAppVersion } from './lib/runtimeConfig'

type ImageInfo = { name?: string | null }

type SessionDto = {
  id?: string
  createdAt?: string
}

type ClientStatus = {
  id?: string
  patientName?: string | null
  deviceId?: string | null
  status?: number
  errors?: string[] | null
}

type SetTestRequest = {
  sessionId?: string
  testIdentification?: number
  testName?: string
  eye?: number
  imageName?: string
  distance?: number
  visualAcuity?: number
  glassesOff?: boolean
  deviceType?: number
}

type LogEntry = {
  id: string
  ts: string
  method: string
  url: string
  status?: number
  ok?: boolean
  note?: string
  durationMs?: number
  response?: string
}

const statusLabel = (status?: number) => {
  if (status === 0) return 'Connected'
  if (status === 1) return 'Timeout'
  if (status === 2) return 'Disconnected'
  return 'Unknown'
}

const eyeOptions = [
  { value: 0, label: 'Left' },
  { value: 1, label: 'Right' },
  { value: 2, label: 'Both' }
]

const deviceOptions = [
  { value: 0, label: 'All' },
  { value: 1, label: 'Desktop' },
  { value: 2, label: 'Mobile' }
]

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

async function apiGet<T>(
  path: string,
  logAdd?: (entry: LogEntry) => void,
  logUpdate?: (id: string, patch: Partial<LogEntry>) => void
): Promise<T> {
  const base = getApiBaseUrl() || 'https://localhost:7227'
  const url = `${base}${path}`
  const id = makeId()
  const entry: LogEntry = { id, ts: new Date().toLocaleTimeString(), method: 'GET', url }
  logAdd?.(entry)
  const start = performance.now()
  const res = await fetch(url)
  const durationMs = Math.round(performance.now() - start)
  let responsePreview = ''
  try {
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('application/json') || ct.includes('text/')) {
      responsePreview = (await res.clone().text()).slice(0, 300)
    }
  } catch {
    responsePreview = ''
  }
  logUpdate?.(id, { status: res.status, ok: res.ok, durationMs, response: responsePreview })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Request failed: ${res.status}`)
  }
  return (await res.json()) as T
}

async function apiPost<T>(
  path: string,
  body?: unknown,
  logAdd?: (entry: LogEntry) => void,
  logUpdate?: (id: string, patch: Partial<LogEntry>) => void
): Promise<T> {
  const base = getApiBaseUrl() || 'https://localhost:7227'
  const url = `${base}${path}`
  const id = makeId()
  const entry: LogEntry = {
    id,
    ts: new Date().toLocaleTimeString(),
    method: 'POST',
    url,
    note: body ? JSON.stringify(body) : undefined
  }
  logAdd?.(entry)
  const start = performance.now()
  const res = await fetch(url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }
  )
  const durationMs = Math.round(performance.now() - start)
  let responsePreview = ''
  try {
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('application/json') || ct.includes('text/')) {
      responsePreview = (await res.clone().text()).slice(0, 300)
    }
  } catch {
    responsePreview = ''
  }
  logUpdate?.(id, { status: res.status, ok: res.ok, durationMs, response: responsePreview })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Request failed: ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return (await res.json()) as T
  }
  return undefined as T
}

async function apiGetImage(
  name: string,
  logAdd?: (entry: LogEntry) => void,
  logUpdate?: (id: string, patch: Partial<LogEntry>) => void
): Promise<string> {
  const base = getApiBaseUrl() || 'https://localhost:7227'
  const url = `${base}/api/v1/image/${encodeURIComponent(name)}`
  const id = makeId()
  const entry: LogEntry = { id, ts: new Date().toLocaleTimeString(), method: 'GET', url }
  logAdd?.(entry)
  const start = performance.now()
  const res = await fetch(url)
  const durationMs = Math.round(performance.now() - start)
  logUpdate?.(id, { status: res.status, ok: res.ok, durationMs, response: 'binary' })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Image failed: ${res.status}`)
  }
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

export default function App() {
  const apiBase = useMemo(() => getApiBaseUrl() || 'https://localhost:7227', [])
  const appVersion = useMemo(() => getAppVersion(), [])
  const [images, setImages] = useState<ImageInfo[]>([])
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})
  const [sessions, setSessions] = useState<SessionDto[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string>('')
  const [clients, setClients] = useState<ClientStatus[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>('')
  const [info, setInfo] = useState<string>('')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [testReq, setTestReq] = useState<SetTestRequest>({
    testIdentification: 1,
    testName: 'Default Test',
    eye: 2,
    distance: 60,
    visualAcuity: 1.0,
    glassesOff: false,
    deviceType: 0
  })
  const refreshTimer = useRef<number | null>(null)

  const imageNames = useMemo(() => images.map(i => i.name).filter(Boolean) as string[], [images])
  const addLog = (entry: LogEntry) => {
    setLogs(prev => {
      const next = [entry, ...prev]
      return next.slice(0, 200)
    })
  }
  const updateLog = (id: string, patch: Partial<LogEntry>) => {
    setLogs(prev => prev.map(l => (l.id === id ? { ...l, ...patch } : l)))
  }

  useEffect(() => {
    const run = async () => {
      setError('')
      try {
        const [imgList, sessionList] = await Promise.all([
          apiGet<ImageInfo[]>('/api/v1/image'),
          apiGet<SessionDto[]>('/api/v1/session')
        ])
        setImages(imgList)
        setSessions(sessionList)
        if (sessionList.length > 0 && !selectedSessionId) {
          setSelectedSessionId(sessionList[0].id || '')
        }
      } catch (e: any) {
        setError(e?.message || 'Failed to load data')
      }
    }
    run()
  }, [])

  useEffect(() => {
    if (imageNames.length === 0) return
    let cancelled = false

    const loadPreviews = async () => {
      const urls: Record<string, string> = {}
      for (const name of imageNames) {
        if (imageUrls[name]) {
          urls[name] = imageUrls[name]
          continue
        }
        try {
          const url = await apiGetImage(name)
          if (!cancelled) urls[name] = url
        } catch {
          // ignore single image errors
        }
      }
      if (!cancelled) {
        setImageUrls(prev => ({ ...prev, ...urls }))
      } else {
        Object.values(urls).forEach(u => URL.revokeObjectURL(u))
      }
    }

    loadPreviews()

    return () => {
      cancelled = true
    }
  }, [imageNames])

  useEffect(() => {
    if (!selectedSessionId) {
      setClients([])
      return
    }

    const fetchClients = async () => {
      try {
        const data = await apiGet<ClientStatus[]>(
          `/api/v1/session/${selectedSessionId}/information`
        )
        setClients(data)
      } catch (e: any) {
        setError(e?.message || 'Failed to load clients')
      }
    }

    fetchClients()
    if (refreshTimer.current) window.clearInterval(refreshTimer.current)
    refreshTimer.current = window.setInterval(fetchClients, 3000)

    return () => {
      if (refreshTimer.current) window.clearInterval(refreshTimer.current)
    }
  }, [selectedSessionId])

  useEffect(() => {
    if (!testReq.imageName && imageNames.length > 0) {
      setTestReq(prev => ({ ...prev, imageName: imageNames[0] }))
    }
  }, [imageNames, testReq.imageName])

  const startSession = async () => {
    setBusy(true)
    setError('')
    setInfo('')
    try {
      const session = await apiPost<SessionDto>('/api/v1/session/start', undefined, addLog, updateLog)
      setSessions(prev => [session, ...prev])
      if (session.id) setSelectedSessionId(session.id)
      setInfo('Session started')
    } catch (e: any) {
      setError(e?.message || 'Failed to start session')
    } finally {
      setBusy(false)
    }
  }

  const endSession = async () => {
    if (!selectedSessionId) return
    setBusy(true)
    setError('')
    setInfo('')
    try {
      await apiPost('/api/v1/session/end', { id: selectedSessionId }, addLog, updateLog)
      setSessions(prev => prev.filter(s => s.id !== selectedSessionId))
      setSelectedSessionId('')
      setInfo('Session ended')
    } catch (e: any) {
      setError(e?.message || 'Failed to end session')
    } finally {
      setBusy(false)
    }
  }

  const sendTest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSessionId) {
      setError('Select a session first')
      return
    }
    setBusy(true)
    setError('')
    setInfo('')
    try {
      await apiPost('/api/v1/test/set', {
        ...testReq,
        sessionId: selectedSessionId
      }, addLog, updateLog)
      setInfo('Test sent')
    } catch (err: any) {
      setError(err?.message || 'Failed to send test')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Online Testing</p>
          <h1>Session Control Console</h1>
        </div>
        <div className="status-chip">
          <span className="dot" />
          <span>API: {apiBase}</span>
          <span className="sep" />
          <span>{appVersion}</span>
        </div>
      </header>

      <div className="layout">
        <main className="main">
          <section className="grid">
            <div className="card">
              <h2>Sessions</h2>
              <div className="row">
                <button className="btn primary" onClick={startSession} disabled={busy}>
                  Start session
                </button>
                <button className="btn" onClick={endSession} disabled={busy || !selectedSessionId}>
                  End session
                </button>
              </div>
              <div className="field">
                <label>Active session</label>
                <select
                  value={selectedSessionId}
                  onChange={e => setSelectedSessionId(e.target.value)}
                >
                  <option value="">Select session</option>
                  {sessions.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.id} — {s.createdAt ? new Date(s.createdAt).toLocaleString() : 'n/a'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="list">
                {sessions.length === 0 && <div className="muted">No sessions yet</div>}
                {sessions.map(s => (
                  <div key={s.id} className={`session-item ${s.id === selectedSessionId ? 'active' : ''}`}>
                    <div className="session-id">{s.id}</div>
                    <div className="session-time">{s.createdAt ? new Date(s.createdAt).toLocaleString() : 'n/a'}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <h2>Clients in Session</h2>
              <p className="muted">Auto-refresh every 3 seconds.</p>
              <div className="table">
                <div className="table-head">
                  <span>Patient</span>
                  <span>Device</span>
                  <span>Status</span>
                  <span>Errors</span>
                </div>
                {clients.length === 0 && (
                  <div className="table-row muted">No clients for this session</div>
                )}
                {clients.map(c => (
                  <div key={c.id} className="table-row">
                    <span className="cell-wrap">{c.patientName || '—'}</span>
                    <span className="cell-wrap">{c.deviceId || '—'}</span>
                    <span className={`pill status-${c.status}`}>{statusLabel(c.status)}</span>
                    <span className="cell-wrap cell-errors" title={c.errors?.join(', ') || ''}>
                      {c.errors?.join(', ') || '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="grid">
            <div className="card">
              <h2>Images</h2>
              <div className="image-grid">
                {imageNames.length === 0 && <div className="muted">No images available</div>}
                {imageNames.map(name => (
                  <div key={name} className="image-card">
                    <div className="image-preview">
                      {imageUrls[name] ? (
                        <img src={imageUrls[name]} alt={name} />
                      ) : (
                        <div className="placeholder">Preview</div>
                      )}
                    </div>
                    <div className="image-name">{name}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <h2>Send Test</h2>
              <form className="form" onSubmit={sendTest}>
                <div className="field">
                  <label>Test name</label>
                  <input
                    value={testReq.testName || ''}
                    onChange={e => setTestReq(prev => ({ ...prev, testName: e.target.value }))}
                    placeholder="Snellen"
                  />
                </div>
                <div className="field">
                  <label>Test identification</label>
                  <input
                    type="number"
                    value={testReq.testIdentification ?? ''}
                    onChange={e => setTestReq(prev => ({ ...prev, testIdentification: Number(e.target.value) }))}
                  />
                </div>
                <div className="field">
                  <label>Eye</label>
                  <select
                    value={testReq.eye ?? 2}
                    onChange={e => setTestReq(prev => ({ ...prev, eye: Number(e.target.value) }))}
                  >
                    {eyeOptions.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Image</label>
                  <select
                    value={testReq.imageName || ''}
                    onChange={e => setTestReq(prev => ({ ...prev, imageName: e.target.value }))}
                  >
                    <option value="">Select image</option>
                    {imageNames.map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Distance (cm)</label>
                  <input
                    type="number"
                    value={testReq.distance ?? ''}
                    onChange={e => setTestReq(prev => ({ ...prev, distance: Number(e.target.value) }))}
                  />
                </div>
                <div className="field">
                  <label>Visual acuity</label>
                  <input
                    type="number"
                    step="0.01"
                    value={testReq.visualAcuity ?? ''}
                    onChange={e => setTestReq(prev => ({ ...prev, visualAcuity: Number(e.target.value) }))}
                  />
                </div>
                <div className="field checkbox">
                  <label>
                    <input
                      type="checkbox"
                      checked={Boolean(testReq.glassesOff)}
                      onChange={e => setTestReq(prev => ({ ...prev, glassesOff: e.target.checked }))}
                    />
                    Glasses off
                  </label>
                </div>
                <div className="field">
                  <label>Device type</label>
                  <select
                    value={testReq.deviceType ?? 0}
                    onChange={e => setTestReq(prev => ({ ...prev, deviceType: Number(e.target.value) }))}
                  >
                    {deviceOptions.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <button className="btn primary" type="submit" disabled={busy}>
                  Send test
                </button>
              </form>
            </div>
          </section>
        </main>

        <aside className="aside">
          <div className="card log-card">
            <div className="row">
              <h2 style={{ marginRight: 'auto' }}>Request Log</h2>
              <button className="btn" onClick={() => setLogs([])}>Clear</button>
            </div>
            <div className="log">
              {logs.length === 0 && <div className="muted">No requests yet</div>}
              {logs.map(l => (
                <div key={l.id} className="log-row">
                  <div className="log-top">
                    <span className="log-ts">{l.ts}</span>
                    <span className={`log-method ${l.method.toLowerCase()}`}>{l.method}</span>
                    <span className="log-status-chip">{l.status ?? '...'}</span>
                    {typeof l.durationMs === 'number' && (
                      <span className="log-duration">{l.durationMs} ms</span>
                    )}
                  </div>
                  <div className="log-url">{l.url}</div>
                  {l.note && (
                    <div className="log-payload">
                      <div className="log-label">Request</div>
                      <code>{l.note}</code>
                    </div>
                  )}
                  {l.response && (
                    <div className="log-response">
                      <div className="log-label">Response</div>
                      <code>{l.response}</code>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {(error || info) && (
        <div className={`toast ${error ? 'error' : 'info'}`}>
          {error || info}
        </div>
      )}
    </div>
  )
}

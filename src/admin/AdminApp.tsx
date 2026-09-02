import { type FormEvent, useEffect, useState } from 'react'
import {
  getAdminSession,
  getAdminSuggestions,
  loginAdmin,
  logoutAdmin,
  reviewAdminSuggestion,
} from '../api'
import type { AdminSuggestion } from '../types'
import { DiffView } from './DiffView'

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

function AdminLogin({ onLogin }: { onLogin: (username: string) => void }) {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const session = await loginAdmin(username, password)
      onLogin(session.username)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível entrar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="admin-login-shell">
      <a className="admin-brand" href="/"><span>O QUE É<br />O QUE É?</span><small>ADMIN</small></a>
      <section className="admin-login-card">
        <span className="admin-kicker">ÁREA RESTRITA</span>
        <h1>ENTRAR<br />PARA REVISAR.</h1>
        <form onSubmit={submit}>
          <label htmlFor="admin-user">USUÁRIO</label>
          <input id="admin-user" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} />
          <label htmlFor="admin-password">SENHA</label>
          <input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          {error ? <p className="admin-error" role="alert">{error}</p> : null}
          <button type="submit" disabled={loading}>{loading ? 'ENTRANDO…' : 'ENTRAR →'}</button>
        </form>
      </section>
    </main>
  )
}

function ModerationPanel({ username, onLogout }: { username: string; onLogout: () => void }) {
  const [suggestions, setSuggestions] = useState<AdminSuggestion[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [reviewing, setReviewing] = useState(false)

  useEffect(() => {
    getAdminSuggestions().then((items) => {
      setSuggestions(items)
      setSelectedId(items[0]?.id ?? null)
    }).catch((caught) => setError(caught instanceof Error ? caught.message : 'Erro ao carregar.')).finally(() => setLoading(false))
  }, [])

  const selected = suggestions.find((suggestion) => suggestion.id === selectedId) ?? suggestions[0]

  async function review(decision: 'approve' | 'reject') {
    if (!selected) return
    setReviewing(true)
    setError('')
    try {
      await reviewAdminSuggestion(selected.id, decision)
      const remaining = suggestions.filter((suggestion) => suggestion.id !== selected.id)
      setSuggestions(remaining)
      setSelectedId(remaining[0]?.id ?? null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível revisar.')
    } finally {
      setReviewing(false)
    }
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <a className="admin-brand" href="/"><span>O QUE É<br />O QUE É?</span><small>ADMIN</small></a>
        <div><span className="admin-user">{username}</span><button type="button" onClick={onLogout}>SAIR ↗</button></div>
      </header>
      <div className="admin-workspace">
        <aside className="admin-queue">
          <div className="admin-queue-heading"><h1>SUGESTÕES</h1><span>{suggestions.length}</span></div>
          {loading ? <p className="admin-empty">CARREGANDO…</p> : null}
          {!loading && suggestions.length === 0 ? <p className="admin-empty">TUDO REVISADO.<br />A FILA ESTÁ VAZIA.</p> : null}
          {suggestions.map((suggestion) => (
            <button className={suggestion.id === selected?.id ? 'active' : ''} key={suggestion.id} type="button" onClick={() => setSelectedId(suggestion.id)}>
              <strong>{suggestion.title}</strong>
              <span>{suggestion.author || 'Anônimo'} · {dateFormatter.format(new Date(suggestion.createdAt))}</span>
            </button>
          ))}
        </aside>
        <main className="admin-review">
          {error ? <p className="admin-error" role="alert">{error}</p> : null}
          {selected ? (
            <>
              <div className="admin-review-title">
                <div><span className="admin-kicker">REVISÃO #{selected.id}</span><h2>{selected.title}</h2></div>
                <a href={`/${selected.slug}`} target="_blank" rel="noreferrer">VER VERBETE ↗</a>
              </div>
              <section className="diff-grid">
                <article><h3>TEXTO ATUAL</h3><DiffView before={selected.currentDefinition} after={selected.proposedDefinition} side="before" /></article>
                <article><h3>TEXTO SUGERIDO</h3><DiffView before={selected.currentDefinition} after={selected.proposedDefinition} side="after" /></article>
              </section>
              <div className="diff-legend"><span><i className="legend-same" />MANTIDO</span><span><i className="legend-removed" />REMOVIDO</span><span><i className="legend-added" />ADICIONADO</span></div>
              <footer className="admin-actions">
                <div><span>ENVIADA POR</span><strong>{selected.author || 'Anônimo'}</strong></div>
                <button className="reject" disabled={reviewing} type="button" onClick={() => review('reject')}>REJEITAR ×</button>
                <button className="approve" disabled={reviewing} type="button" onClick={() => review('approve')}>APROVAR ✓</button>
              </footer>
            </>
          ) : !loading ? <div className="admin-done"><span>✓</span><h2>NADA PENDENTE.</h2><p>As novas sugestões aparecerão aqui.</p></div> : null}
        </main>
      </div>
    </div>
  )
}

export function AdminApp() {
  const [username, setUsername] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    document.title = 'Admin — O que é o que é?'
    getAdminSession().then((session) => setUsername(session.authenticated ? session.username : null)).finally(() => setChecking(false))
  }, [])

  async function logout() {
    await logoutAdmin()
    setUsername(null)
  }

  if (checking) return <div className="admin-boot">O QUE É O QUE É? <span>ADMIN</span></div>
  return username ? <ModerationPanel username={username} onLogout={logout} /> : <AdminLogin onLogin={setUsername} />
}

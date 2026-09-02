import { startTransition, useCallback, useEffect, useState } from 'react'
import { getEntry } from './api'
import { EntrySkeleton, EntryView } from './components/EntryView'
import { HistorySheet } from './components/HistorySheet'
import { SearchForm } from './components/SearchForm'
import { SuggestionSheet } from './components/SuggestionSheet'
import type { Entry } from './types'
import { AdminApp } from './admin/AdminApp'

function currentTopic() {
  try {
    return decodeURIComponent(window.location.pathname.slice(1)).trim()
  } catch {
    return ''
  }
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

function PublicApp() {
  const [topic, setTopic] = useState(currentTopic)
  const [entry, setEntry] = useState<Entry | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(Boolean(topic))
  const [sheet, setSheet] = useState<'search' | 'suggestion' | 'history' | 'sent' | null>(null)

  const closeSheet = useCallback(() => setSheet(null), [])

  useEffect(() => {
    document.body.classList.add('public-app')
    return () => document.body.classList.remove('public-app')
  }, [])

  useEffect(() => {
    const onPopState = () => {
      startTransition(() => {
        setTopic(currentTopic())
        setSheet(null)
      })
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    if (!topic) {
      setEntry(null)
      setError('')
      setIsLoading(false)
      document.title = 'O que é o que é?'
      return
    }

    const slug = slugify(topic)
    if (!slug) {
      setError('Esse tema não parece válido. Tente escrever de outro jeito.')
      setIsLoading(false)
      return
    }

    const controller = new AbortController()
    setEntry(null)
    setError('')
    setIsLoading(true)
    getEntry(slug, controller.signal)
      .then((nextEntry) => {
        const canonicalSlug = slugify(nextEntry.title)
        if (canonicalSlug && canonicalSlug !== slug) {
          window.location.replace(`/${canonicalSlug}`)
          return
        }
        setEntry(nextEntry)
        document.title = `${nextEntry.title} — O que é o que é?`
      })
      .catch((caught) => {
        if (caught instanceof Error && caught.name !== 'AbortError') setError(caught.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })

    return () => controller.abort()
  }, [topic])

  const navigateToTopic = useCallback((value: string) => {
    if (!value) {
      setSheet('search')
      return
    }
    const slug = slugify(value)
    if (!slug) return
    window.history.pushState({}, '', `/${slug}`)
    startTransition(() => {
      setTopic(slug)
      setSheet(null)
    })
  }, [])

  function goHome() {
    window.history.pushState({}, '', '/')
    startTransition(() => {
      setTopic('')
      setSheet(null)
    })
  }

  return (
    <div className={`app-shell ${topic ? 'entry-shell' : 'home-shell'}`}>
      <header className="site-header">
        <button className="brand" type="button" onClick={goHome} aria-label="Ir para o início">
          <span>O QUE É<br />O QUE É?</span>
        </button>
        {topic ? <SearchForm compact onSearch={navigateToTopic} /> : null}
      </header>

      <main>
        {!topic ? (
          <section className="home">
            <span className="home-question" aria-hidden="true">?</span>
            <h1><span>QUALQUER</span><span>ASSUNTO.</span><span>SEM</span><span>COMPLICAÇÃO.</span></h1>
            <p className="home-description">Uma explicação curta, em linguagem simples, com fontes para continuar aprendendo.</p>
            <SearchForm onSearch={navigateToTopic} />
            <nav className="home-examples" aria-label="Exemplos de temas">
              <strong>EXEMPLOS</strong>
              <button onClick={() => navigateToTopic('política')}>POLÍTICA <span>↗</span></button>
              <button onClick={() => navigateToTopic('amor')}>AMOR <span>↗</span></button>
              <button onClick={() => navigateToTopic('inteligência artificial')}>INTELIGÊNCIA ARTIFICIAL <span>↗</span></button>
            </nav>
          </section>
        ) : null}

        {isLoading ? <EntrySkeleton /> : null}
        {error ? (
          <section className="error-state" role="alert">
            <h1>Não deu para explicar agora.</h1>
            <p>{error}</p>
            <button type="button" onClick={goHome}>Buscar outro tema</button>
          </section>
        ) : null}
        {entry ? (
          <EntryView entry={entry} onEdit={() => setSheet('suggestion')} onHistory={() => setSheet('history')} />
        ) : null}
      </main>

      {sheet === 'search' ? (
        <div className="search-overlay" role="dialog" aria-modal="true" aria-label="Buscar outro tema">
          <button className="overlay-close" type="button" onClick={closeSheet}>Fechar</button>
          <SearchForm onSearch={navigateToTopic} />
        </div>
      ) : null}
      {sheet === 'suggestion' && entry ? (
        <SuggestionSheet entry={entry} onClose={closeSheet} onSent={() => setSheet('sent')} />
      ) : null}
      {sheet === 'history' && entry ? <HistorySheet entry={entry} onClose={closeSheet} /> : null}
      {sheet === 'sent' ? (
        <div className="toast" role="status">
          <strong>Sugestão enviada.</strong>
          <span>Ela entrou no histórico para revisão.</span>
          <button type="button" onClick={closeSheet}>Tudo bem</button>
        </div>
      ) : null}
    </div>
  )
}

export default function App() {
  return window.location.pathname.startsWith('/admin') ? <AdminApp /> : <PublicApp />
}

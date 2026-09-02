import { useEffect, useState } from 'react'
import { getHistory } from '../api'
import { CloseIcon } from '../icons'
import type { Entry, Version } from '../types'

type HistorySheetProps = {
  entry: Entry
  onClose: () => void
}

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

export function HistorySheet({ entry, onClose }: HistorySheetProps) {
  const [versions, setVersions] = useState<Version[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    getHistory(entry.slug, controller.signal).then(setVersions).catch((caught) => {
      if (caught instanceof Error && caught.name !== 'AbortError') setError(caught.message)
    })
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    document.body.classList.add('sheet-open')
    return () => {
      controller.abort()
      document.removeEventListener('keydown', onKeyDown)
      document.body.classList.remove('sheet-open')
    }
  }, [entry.slug, onClose])

  return (
    <div className="sheet-layer" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="sheet history-sheet" role="dialog" aria-modal="true" aria-labelledby="history-title">
        <div className="sheet-handle" />
        <div className="sheet-heading-row">
          <div>
            <h2 id="history-title">Histórico</h2>
            <p className="sheet-description">Mudanças e sugestões para “{entry.title}”.</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar histórico">
            <CloseIcon />
          </button>
        </div>

        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {!error && versions.length === 0 ? <p className="history-loading">Carregando histórico…</p> : null}
        <ol className="version-list">
          {versions.map((version) => (
            <li key={version.id}>
              <div className="version-meta">
                <strong>{version.kind === 'suggestion' ? 'Sugestão' : 'Versão publicada'}</strong>
                <span>{version.status === 'pending' ? 'aguardando revisão' : version.isCurrent ? 'atual' : 'anterior'}</span>
              </div>
              <p>{version.definition}</p>
              <time dateTime={version.createdAt}>
                {version.author ? `${version.author} · ` : ''}{dateFormatter.format(new Date(version.createdAt))}
              </time>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}

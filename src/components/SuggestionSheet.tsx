import { type FormEvent, useEffect, useState } from 'react'
import { getBotChallenge, sendSuggestion } from '../api'
import type { Entry } from '../types'

type SuggestionSheetProps = {
  entry: Entry
  onClose: () => void
  onSent: () => void
}

export function SuggestionSheet({ entry, onClose, onSent }: SuggestionSheetProps) {
  const [definition, setDefinition] = useState(entry.definition)
  const [author, setAuthor] = useState('')
  const [error, setError] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [antiBotToken, setAntiBotToken] = useState('')
  const [website, setWebsite] = useState('')

  useEffect(() => {
    getBotChallenge().then((challenge) => setAntiBotToken(challenge.token)).catch(() => {
      setError('Não foi possível ativar a proteção do formulário. Tente reabrir.')
    })
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    document.body.classList.add('sheet-open')
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.classList.remove('sheet-open')
    }
  }, [onClose])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSending(true)
    try {
      await sendSuggestion(entry.slug, definition, author, antiBotToken, website)
      onSent()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível enviar.')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="sheet-layer" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="suggestion-title">
        <div className="sheet-handle" />
        <h2 id="suggestion-title">SUGERIR CORREÇÃO</h2>
        <p className="sheet-description">Mude o texto se algo estiver errado ou pouco claro.</p>
        <form onSubmit={submit}>
          <div className="bot-field" aria-hidden="true">
            <label htmlFor="website">Não preencha este campo</label>
            <input
              id="website"
              name="website"
              autoComplete="off"
              tabIndex={-1}
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
            />
          </div>
          <label htmlFor="suggestion">SUA SUGESTÃO DE CORREÇÃO</label>
          <textarea
            id="suggestion"
            autoFocus
            maxLength={600}
            minLength={40}
            onChange={(event) => setDefinition(event.target.value)}
            required
            rows={5}
            value={definition}
          />
          <div className="field-meta"><span>{definition.length}/600</span></div>

          <label htmlFor="author">SEU NOME <span>(OPCIONAL)</span></label>
          <input
            id="author"
            maxLength={80}
            onChange={(event) => setAuthor(event.target.value)}
            placeholder="Ex.: Ana Silva"
            value={author}
          />

          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <p className="bot-status">PROTEÇÃO CONTRA ENVIOS AUTOMÁTICOS ATIVA</p>

          <div className="form-actions">
            <button className="cancel-button" type="button" onClick={onClose}>CANCELAR</button>
            <button className="primary-button" disabled={isSending || !antiBotToken} type="submit">
              {isSending ? 'ENVIANDO…' : 'ENVIAR'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

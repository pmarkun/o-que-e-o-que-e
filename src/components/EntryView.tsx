import { ArrowIcon, EditIcon, ExternalIcon, HistoryIcon } from '../icons'
import type { Entry } from '../types'

type EntryViewProps = {
  entry: Entry
  onEdit: () => void
  onHistory: () => void
}

export function EntryView({ entry, onEdit, onHistory }: EntryViewProps) {
  const titleLength = entry.title.length
  const titleClass = titleLength > 20 ? 'title-xlong' : titleLength > 13 ? 'title-long' : titleLength > 8 ? 'title-medium' : 'title-short'
  const definitionLength = entry.definition.length
  const definitionClass = definitionLength > 265 ? 'definition-long' : definitionLength > 190 ? 'definition-medium' : 'definition-short'
  return (
    <article className="entry">
      <span className="entry-question" aria-hidden="true">?</span>
      <header className="entry-header">
        <h1 className={titleClass}>{entry.title}</h1>
        <p className="simple-label">EM LINGUAGEM SIMPLES</p>
        <p className={`definition ${definitionClass}`}>{entry.definition}</p>
      </header>

      {entry.references.length > 0 ? <section className="references" aria-labelledby="references-title">
        <h2 id="references-title">PARA IR ALÉM</h2>
        <ul>
          {entry.references.map((reference) => (
            <li key={reference.url}>
              <a href={reference.url} target="_blank" rel="noreferrer">
                <span className="source-mark" aria-hidden="true">{reference.title.slice(0, 1).toLocaleUpperCase('pt-BR')}</span>
                <span>{reference.title}</span>
                <ExternalIcon />
              </a>
            </li>
          ))}
        </ul>
      </section> : null}

      <div className="entry-actions">
        <button type="button" onClick={onEdit}>
          <EditIcon />
          <span>SUGERIR CORREÇÃO</span>
        </button>
        <button type="button" onClick={onHistory}>
          <HistoryIcon />
          <span>VER HISTÓRICO</span>
          <ArrowIcon className="action-arrow" />
        </button>
      </div>
    </article>
  )
}

export function EntrySkeleton() {
  return (
    <div className="entry skeleton" aria-label="Criando uma explicação simples" aria-busy="true">
      <div className="skeleton-line skeleton-title" />
      <div className="skeleton-line" />
      <div className="skeleton-line" />
      <div className="skeleton-line short" />
      <div className="skeleton-label" />
      <div className="skeleton-section" />
    </div>
  )
}

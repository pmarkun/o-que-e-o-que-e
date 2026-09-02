import { type FormEvent, useState } from 'react'
import { SearchIcon } from '../icons'

type SearchFormProps = {
  compact?: boolean
  onSearch: (topic: string) => void
}

export function SearchForm({ compact = false, onSearch }: SearchFormProps) {
  const [query, setQuery] = useState('')
  const words = query.trim() ? query.trim().split(/\s+/).length : 0

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = query.trim()
    if (value) onSearch(value)
  }

  function updateQuery(value: string) {
    const limitedWords = value.split(/\s+/).slice(0, 6).join(' ')
    setQuery(limitedWords.slice(0, 60))
  }

  if (compact) {
    return (
      <button className="search-trigger" type="button" onClick={() => onSearch('')}>
        <SearchIcon size={20} />
        <span>OUTRO TEMA</span>
      </button>
    )
  }

  return (
    <form className="search-form" onSubmit={submit}>
      <label htmlFor="topic-search">O que você quer entender?</label>
      <div className="search-field">
        <SearchIcon size={21} />
        <input
          id="topic-search"
          autoComplete="off"
          autoFocus
          aria-describedby="topic-limits"
          maxLength={60}
          onChange={(event) => updateQuery(event.target.value)}
          placeholder="política, amor, inflação..."
          value={query}
        />
        <button type="submit" disabled={!query.trim()} aria-label="Buscar definição">VER</button>
      </div>
      <p className="search-limits" id="topic-limits">
        <span>{query.length}/60 caracteres</span><span>{words}/6 palavras</span>
      </p>
    </form>
  )
}

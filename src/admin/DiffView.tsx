import { wordDiff } from './diff'

type DiffViewProps = {
  before: string
  after: string
  side: 'before' | 'after'
}

export function DiffView({ before, after, side }: DiffViewProps) {
  const visibleTypes = side === 'before' ? new Set(['same', 'removed']) : new Set(['same', 'added'])
  return (
    <p className="diff-text">
      {wordDiff(before, after).filter((part) => visibleTypes.has(part.type)).map((part, index) => (
        <span className={`diff-${part.type}`} key={`${part.type}-${index}`}>{part.value}</span>
      ))}
    </p>
  )
}

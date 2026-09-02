export type DiffPart = {
  value: string
  type: 'same' | 'added' | 'removed'
}

function tokenize(text: string) {
  return text.match(/[\p{L}\p{N}]+|[^\p{L}\p{N}\s]+/gu) ?? []
}

export function wordDiff(before: string, after: string): DiffPart[] {
  const left = tokenize(before)
  const right = tokenize(after)
  const table = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0))

  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i][j] = left[i] === right[j]
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }

  const parts: DiffPart[] = []
  let i = 0
  let j = 0
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) {
      parts.push({ value: left[i], type: 'same' })
      i += 1
      j += 1
    } else if (j < right.length && (i === left.length || table[i][j + 1] >= table[i + 1][j])) {
      parts.push({ value: right[j], type: 'added' })
      j += 1
    } else {
      parts.push({ value: left[i], type: 'removed' })
      i += 1
    }
  }
  return parts
}

export type Reference = {
  title: string
  url: string
}

export type Entry = {
  id: number
  slug: string
  title: string
  definition: string
  references: Reference[]
  createdAt: string
  updatedAt: string
}

export type Version = {
  id: number
  definition: string
  author: string | null
  kind: 'generated' | 'suggestion' | 'revision'
  status: 'published' | 'pending' | 'rejected'
  createdAt: string
  isCurrent: boolean
}

export type BotChallenge = {
  token: string
  minWaitMs: number
}

export type AdminSuggestion = {
  id: number
  entryId: number
  slug: string
  title: string
  currentDefinition: string
  proposedDefinition: string
  author: string | null
  status: 'pending' | 'published' | 'rejected'
  createdAt: string
}

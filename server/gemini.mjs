import { GoogleGenAI } from '@google/genai'
import { normalizeTopic, topicFromSlug } from './topic.mjs'
import { findWikipediaReference } from './wikipedia.mjs'
import { findWiktionaryEntry } from './wiktionary.mjs'

const ENTRY_SCHEMA = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      description: 'O nome do assunto em português, curto e em caixa baixa quando apropriado.',
    },
    definition: {
      type: 'string',
      description: 'Explicação direta em português do Brasil, com 2 ou 3 frases e entre 160 e 300 caracteres.',
    },
    blocked: {
      type: 'boolean',
      description: 'Verdadeiro somente para pessoa identificável ou termo usado para atacar um grupo protegido.',
    },
    corrected: {
      type: 'boolean',
      description: 'Verdadeiro somente quando a busca contém um erro ortográfico inequívoco e o título traz a correção.',
    },
  },
  required: ['title', 'definition', 'blocked', 'corrected'],
}

const BLOCKED_DEFINITION = 'Este site não responde a pedidos para definir pessoas nem termos usados para atacar ou desumanizar grupos. Se este bloqueio parecer um erro e você tiver uma boa definição, envie uma sugestão para revisão.'

const EMPTY_PHRASES = [
  /(?:é|ser) (?:a|uma|um) arte de/i,
  /para o bem comum/i,
  /pode ser entendid[oa] como/i,
  /refere-se a/i,
  /em linhas gerais/i,
]

function validateGeneratedEntry(value, fallbackTitle) {
  if (!value || typeof value !== 'object') throw new Error('Resposta inválida do modelo')

  const proposedTitle = typeof value.title === 'string' ? value.title.trim().slice(0, 100) : ''
  const requestedSlug = normalizeTopic(fallbackTitle)
  const proposedSlug = normalizeTopic(proposedTitle)
  const isSameTopic = Boolean(proposedSlug && proposedSlug === requestedSlug)
  const corrected = value.corrected === true && Boolean(proposedSlug) && !isSameTopic
  if (proposedSlug && !isSameTopic && value.corrected !== true) {
    throw new Error('O modelo trocou o assunto sem marcar uma correção')
  }
  const title = isSameTopic || corrected ? proposedTitle : fallbackTitle
  if (value.blocked === true) {
    return { title: isSameTopic ? title : fallbackTitle, definition: BLOCKED_DEFINITION, blocked: true, corrected: false }
  }
  const definition = typeof value.definition === 'string'
    ? value.definition.replace(/\s+/g, ' ').trim().slice(0, 360)
    : ''

  const normalizedDefinition = definition.toLocaleLowerCase('pt-BR')
  const repeatsAnswer = normalizedDefinition.includes(fallbackTitle.toLocaleLowerCase('pt-BR')) ||
    normalizedDefinition.includes(title.toLocaleLowerCase('pt-BR'))
  const hasEmptyPhrase = EMPTY_PHRASES.some((pattern) => pattern.test(definition))
  const hasCompleteEnding = /[.!?]$/.test(definition)

  if (
    definition.length < 120 ||
    definition.length > 330 ||
    repeatsAnswer ||
    hasEmptyPhrase ||
    !hasCompleteEnding
  ) {
    throw new Error('O modelo não retornou uma explicação curta')
  }

  return { title: title || fallbackTitle, definition, blocked: false, corrected }
}

export function createGeminiGenerator({
  apiKey,
  model = 'gemini-2.5-flash-lite',
  fetchImpl = fetch,
  onUsage,
}) {
  if (!apiKey) {
    return async () => {
      const error = new Error('Gemini não configurado')
      error.code = 'GEMINI_NOT_CONFIGURED'
      throw error
    }
  }

  const client = new GoogleGenAI({ apiKey })

  return async function generateEntry(slug) {
    const topic = topicFromSlug(slug)
    const wikipediaReference = findWikipediaReference(topic, fetchImpl)
    const dictionaryEntry = await findWiktionaryEntry(topic, fetchImpl)
    const dictionaryEvidence = dictionaryEntry ? `

EVIDÊNCIA DE DICIONÁRIO PARA ESTA BUSCA:
Entrada: “${dictionaryEntry.title}”
${dictionaryEntry.extract}
Esta evidência confirma que a busca é uma palavra válida. Marque corrected=false, use esse significado e não a confunda com palavra parecida.` : ''
    const basePrompt = `Explique “${topic}” para alguém que quer entender rápido, em português do Brasil.

Primeiro decida se há erro de escrita:
- Trate a busca como intencional. Se ela for uma palavra ou expressão válida, mesmo rara, antiga, técnica ou pouco conhecida, mantenha o assunto e marque corrected=false.
- Marque corrected=true somente quando houver um erro ortográfico inequívoco e uma única correção muito provável. Semelhança sonora ou de significado não basta.
- Quando corrected=false, o título deve preservar exatamente o assunto pedido, podendo apenas restaurar acentos e caixa. Quando corrected=true, o título deve ser a forma corrigida e a definição deve explicar essa forma. Preserve o singular, plural e gênero sugeridos pela busca sempre que forem identificáveis.
${dictionaryEvidence}

Antes de escrever, aplique esta regra de segurança:
- Marque blocked=true se o assunto for uma pessoa real identificável, viva ou morta, incluindo nome civil, artístico ou apelido conhecido.
- Marque blocked=true se o próprio assunto for um xingamento, termo racista ou expressão usada para atacar ou desumanizar pessoas por raça, etnia, nacionalidade, religião, gênero, sexualidade ou deficiência.
- Não bloqueie conceitos que precisam ser explicados para fins educativos, como racismo, escravidão, preconceito ou nazismo. Não bloqueie uma palavra comum apenas porque ela também pode ser usada como insulto.
- Quando blocked=true, devolva o título e definition="". Não repita nem explique o termo ofensivo.
- Caso contrário, marque blocked=false e siga as instruções abaixo.

Escreva como uma boa pista de “o que é, o que é?”: descreva uma situação, efeito ou mecanismo tão característico que alguém poderia adivinhar a resposta. Não repita o nome do assunto na explicação. O título já será a revelação. Seja levemente divertido, vivo ou provocador, sem fazer trocadilho forçado, rima infantil ou transformar tudo em piada.

Vá direto ao significado prático. Diga o que isso quer dizer na vida real, como funciona ou qual ideia central sustenta o assunto. Prefira uma simplificação útil a uma definição acadêmica vaga. Se houver várias causas importantes, não escolha uma só como se explicasse tudo.

Não comece classificando o assunto como “uma teoria”, “um conceito”, “um sentimento”, “um sistema”, “um processo” ou frases parecidas. Essa classificação gasta palavras sem explicar. Não use “refere-se a”, “pode ser entendido como”, “em linhas gerais”, “envolve”, “é complexo”, “arte de”, “busca promover” ou “para o bem comum”.

Use 2 ou 3 frases curtas, entre 160 e 300 caracteres no total. A primeira funciona como a pista mais forte. As seguintes explicam o mecanismo, uma consequência ou um exemplo concreto. Não aumente o texto com adjetivos ou contexto que não ajude a entender. Use verbos concretos como decide, controla, divide, cobra, produz, cuida ou impede. Pode assumir uma interpretação central quando houver disputa, sem fingir neutralidade vazia, mas não faça propaganda nem esconda controvérsias essenciais.

Exemplos de direção, sem copiar:
- Marxismo: “Você trabalha, produz cem e recebe quarenta; alguém fica com o resto. Essa ideia vê aí o motor do capitalismo e o conflito entre classes. A saída proposta é colocar a produção sob controle coletivo.”
- Política: “Surge quando um grupo precisa decidir quem manda, quais regras valem e para onde vai o dinheiro. Mora no governo, claro, mas também aparece em empresas, movimentos, famílias e relações cotidianas.”
- Amor: “Faz o bem-estar de alguém importar quase tanto quanto o seu. Aparece no cuidado, no desejo, na lealdade e até na coragem de deixar partir. Pode ligar pessoas, comunidades, causas ou lugares.”`

    async function requestDefinition(extraInstruction = '') {
      return client.models.generateContent({
        model,
        contents: `${basePrompt}${extraInstruction}`,
        config: {
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 240,
        responseMimeType: 'application/json',
        responseJsonSchema: ENTRY_SCHEMA,
        },
      })
    }

    let response = await requestDefinition()
    let generated
    try {
      generated = validateGeneratedEntry(JSON.parse(response.text), topic)
    } catch {
      response = await requestDefinition(`

ATENÇÃO: reescreva do zero. A resposta anterior quebrou pelo menos uma regra: repetiu a resposta, usou frase vazia, passou do tamanho ou terminou cortada. Entregue uma pista completa, concreta e terminada por pontuação.`)
      generated = validateGeneratedEntry(JSON.parse(response.text), topic)
    }
    let resolvedDictionaryEntry = dictionaryEntry
    if (generated.corrected) {
      resolvedDictionaryEntry = await findWiktionaryEntry(generated.title, fetchImpl)
      if (resolvedDictionaryEntry) {
        response = await requestDefinition(`

ATENÇÃO: a correção “${generated.title}” foi confirmada pelo Wikcionário. Reescreva a resposta usando obrigatoriamente esta evidência, mantenha corrected=true e não volte ao termo digitado:
${resolvedDictionaryEntry.extract}`)
        generated = validateGeneratedEntry(JSON.parse(response.text), topic)
      }
    }
    onUsage?.(response.usageMetadata)
    if (generated.blocked) return { ...generated, references: [] }
    const wikipediaReferences = generated.corrected
      ? await findWikipediaReference(generated.title, fetchImpl)
      : await wikipediaReference
    const references = resolvedDictionaryEntry
      ? [...wikipediaReferences, resolvedDictionaryEntry.reference]
      : wikipediaReferences
    return { ...generated, references }
  }
}

export function createDemoGenerator() {
  const examples = {
    politica: {
      title: 'política',
      definition: 'Política é disputar e decidir como o poder será usado, quais regras valerão e quem ganha ou perde com as escolhas coletivas.',
      references: [
        { title: 'Política — Wikipédia', url: 'https://pt.wikipedia.org/wiki/Pol%C3%ADtica' },
      ],
    },
    amor: {
      title: 'amor',
      definition: 'Amor é se importar de verdade com alguém ou algo, criando afeto, cuidado e compromisso. Pode unir pessoas, comunidades ou causas.',
      references: [
        { title: 'Amor — Wikipédia', url: 'https://pt.wikipedia.org/wiki/Amor' },
      ],
    },
  }

  return async (slug) => examples[slug] ?? {
    title: topicFromSlug(slug),
    definition: `${topicFromSlug(slug)} explicado de forma concreta e curta no modo de demonstração local. Em produção, o Gemini escreve este verbete sem reasoning.`,
    references: [],
  }
}

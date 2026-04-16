export type ResumeInlineToken =
  | { type: 'text'; text: string }
  | { type: 'add'; text: string }
  | { type: 'del'; text: string }

export type ResumeBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'bullets'; items: string[] }

export type ResumeSection = {
  title: string
  blocks: ResumeBlock[]
}

export type ResumeDoc = {
  name?: string
  contactLines: string[]
  summaryLines: string[]
  sections: ResumeSection[]
}


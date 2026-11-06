import type { Section } from '../types'

export const SECTION_COLORS = ['#e8a071', '#9cac8f', '#9996d6', '#7fb2ae', '#d8a0b1', '#c8b285']

export const SECTION_COLOR_NAMES = [
  'Sunrise',
  'Sage',
  'Lilac',
  'Sea glass',
  'Rose',
  'Sand',
]

export const sectionColor = (section: Section, index: number) =>
  section.color ?? SECTION_COLORS[index % SECTION_COLORS.length]

export const nextSectionName = (sections: Section[]) => {
  const used = new Set(sections.map((section) => section.name.toLowerCase()))
  for (let index = 0; index < 26; index++) {
    const name = `Section ${String.fromCharCode(65 + index)}`
    if (!used.has(name.toLowerCase())) return name
  }
  return `Section ${sections.length + 1}`
}

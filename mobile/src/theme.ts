/** Design tokens from docs/visual-design.html. */
export const colors = {
  paper: '#F5F6EA',
  milk: '#FBFCF4',
  lichen: '#DDE7CB',
  lichenDeep: '#C3D6A8',
  moss: '#3F6B4A',
  mossDeep: '#2C4F37',
  fern: '#1C372A',
  ink: '#1B2A21',
  muted: '#566A5B',
  line: '#D8DFC5',
  sun: '#F0A34A',
  sunSoft: '#FBE8C8',
  sunInk: '#6B3F0A',
  clay: '#B2412B',
  claySoft: '#F6DCD3',
  white: '#FFFFFF',
  /** The page behind the app column on wide screens (web). */
  backdrop: '#E9ECD8',
} as const

export const font = {
  serif: 'Fraunces_400Regular',
  serifMedium: 'Fraunces_500Medium',
  serifItalic: 'Fraunces_400Regular_Italic',
  sans: 'AtkinsonHyperlegibleNext_400Regular',
  sansItalic: 'AtkinsonHyperlegibleNext_400Regular_Italic',
  sansSemi: 'AtkinsonHyperlegibleNext_600SemiBold',
  sansBold: 'AtkinsonHyperlegibleNext_700Bold',
} as const

export const radius = { lg: 28, md: 20, sm: 14, pill: 999 } as const
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const

/** The tab bar floats above content, so scrolling screens need this much room at the bottom. */
export const DOCK_SPACE = 96
export const MAX_WIDTH = 480

/** Design tokens. The palette is ivory, sage, emerald, forest and antique gold; clay is kept for urgent help and errors. */
export const colors = {
  /** Ivory: the page. */
  paper: '#F2EBDD',
  /** A lighter ivory for cards and fields that sit on the page. */
  milk: '#FAF6EC',
  /** Sage, thinned: soft panels and chips. */
  lichen: '#DDE4D3',
  lichenDeep: '#BFCDB8',
  /** Sage, as it is in the palette. */
  sage: '#78947F',
  /** Emerald: the brand colour for buttons and marks. */
  moss: '#185844',
  /** Emerald, deepened: links and text on light, pressed states. */
  mossDeep: '#12453A',
  /** Forest: dark panels, footers and the strongest text. */
  fern: '#102F27',
  ink: '#12261F',
  muted: '#53645A',
  line: '#D8CFB9',
  /** Antique gold: accents, rules and marks. Too light for text on ivory; use sunInk for gold text. */
  sun: '#B08A4F',
  sunSoft: '#EEE0C2',
  sunInk: '#5B4216',
  clay: '#B2412B',
  claySoft: '#F3DDD3',
  white: '#FFFFFF',
  /** The page behind the app column on wide screens (web). */
  backdrop: '#E6DDC8',
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
/** The therapist portal is a desktop web app, so it gets a wide column. */
export const PORTAL_WIDTH = 1180
/** The landing page is a wide marketing page. */
export const LANDING_WIDTH = 1440
export const MAX_WIDTH = 480

import { Text as RNText, type TextProps, type TextStyle } from 'react-native'
import { colors, font } from '@/theme'

export type Variant = 'display' | 'title' | 'h2' | 'h3' | 'body' | 'small' | 'caption' | 'label' | 'quote'

const base: Record<Variant, TextStyle> = {
  display: { fontFamily: font.serif, fontSize: 38, lineHeight: 40, letterSpacing: -0.6 },
  title: { fontFamily: font.serif, fontSize: 31, lineHeight: 34, letterSpacing: -0.3 },
  h2: { fontFamily: font.serif, fontSize: 24, lineHeight: 28, letterSpacing: -0.2 },
  h3: { fontFamily: font.serif, fontSize: 20, lineHeight: 24 },
  body: { fontFamily: font.sans, fontSize: 16, lineHeight: 24 },
  small: { fontFamily: font.sans, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: font.sans, fontSize: 12.5, lineHeight: 17 },
  label: { fontFamily: font.sansSemi, fontSize: 14, lineHeight: 20 },
  quote: { fontFamily: font.serifItalic, fontSize: 18, lineHeight: 26 },
}

const HEADINGS: Variant[] = ['display', 'title', 'h2', 'h3']

export interface Props extends TextProps {
  variant?: Variant
  color?: string
  muted?: boolean
  italic?: boolean
  bold?: boolean
  align?: TextStyle['textAlign']
}

/** One Text component for the whole app, so type stays consistent and fonts never fall back by accident. */
export function Text({ variant = 'body', color, muted, italic, bold, align, style, ...rest }: Props) {
  const family = bold ? font.sansBold : italic ? (HEADINGS.includes(variant) ? font.serifItalic : font.sansItalic) : undefined
  const s: TextStyle = {
    ...base[variant],
    color: color ?? (muted ? colors.muted : colors.ink),
    ...(family ? { fontFamily: family } : null),
    ...(align ? { textAlign: align } : null),
  }
  return (
    <RNText
      accessibilityRole={HEADINGS.includes(variant) ? 'header' : rest.accessibilityRole}
      maxFontSizeMultiplier={HEADINGS.includes(variant) ? 1.3 : 2}
      {...rest}
      style={[s, style]}
    />
  )
}

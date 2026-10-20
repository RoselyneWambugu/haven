import Svg, { Circle, Path } from 'react-native-svg'
import { colors } from '@/theme'

const P: Record<string, string[]> = {
  home: ['M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z'],
  chats: ['M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-5 4v-4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z'],
  forum: ['M5 19C5 10 10 5 20 4c0 10-5 15-14 15z', 'M5 19l8-8'],
  heart: ['M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z'],
  check: ['M5 12.5l4.2 4.2L19 7'],
  back: ['M15 5l-7 7 7 7'],
  chevron: ['M9 5l7 7-7 7'],
  down: ['M5 9l7 7 7-7'],
  send: ['M4 12l16-7-6 16-3-6.5z'],
  mic: ['M12 15a3 3 0 0 0 3-3V7a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3z', 'M6 11a6 6 0 0 0 12 0M12 17v3'],
  micoff: ['M12 15a3 3 0 0 0 3-3V7a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3z', 'M6 11a6 6 0 0 0 12 0M12 17v3', 'M4 4l16 16'],
  spk: ['M5 10v4h3l5 4V6L8 10z', 'M16 9a4 4 0 0 1 0 6'],
  end: ['M5 17c4-5 10-5 14 0l-2 2-3-1.5v-2c-2-.6-4-.6-6 0v2L7 19z'],
  video: ['M15 11l5-3v8l-5-3', 'M5 7h8a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z'],
  videooff: ['M15 11l5-3v8l-5-3', 'M5 7h8a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z', 'M4 4l16 16'],
  phone: ['M7 4l3 4-2 2c1 2.5 3 4.5 6 6l2-2 4 3-2 3c-8 1-16-7-15-15z'],
  cal: ['M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z', 'M4 10h16M9 3v4M15 3v4'],
  person: ['M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M5 20c1-4 4-6 7-6s6 2 7 6'],
  wallet: ['M5 6h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z', 'M16 12h5'],
  dots: [],
  lock: ['M7 11h10a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2z', 'M8 11V8a4 4 0 0 1 8 0v3'],
  eye: ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z'],
  shield: ['M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z'],
  plus: ['M12 5v14M5 12h14'],
  close: ['M6 6l12 12M18 6L6 18'],
  search: ['M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z', 'M20 20l-4.5-4.5'],
  bell: ['M6 17V11a6 6 0 0 1 12 0v6l2 2H4z', 'M10 21a2 2 0 0 0 4 0'],
  help: ['M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z', 'M6.3 6.3l3.4 3.4M17.7 6.3l-3.4 3.4M6.3 17.7l3.4-3.4M17.7 17.7l-3.4-3.4'],
  rocket: ['M12 3c4 2 6 6 5 11l-3 3H10l-3-3c-1-5 1-9 5-11z', 'M9 17l-2 4M15 17l2 4'],
  tool: ['M14 6a4 4 0 0 0 5 5l-9 9-3-3 9-9z'],
  pencil: ['M4 20l1-4L16 5l3 3L8 19z'],
  ticket: ['M4 8a2 2 0 0 0 0 8v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2a2 2 0 0 1 0-8V6a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1z', 'M13 5v14'],
  flag: ['M6 21V4', 'M6 5h11l-2 4 2 4H6'],
  mute: ['M5 10v4h3l5 4V6L8 10z', 'M4 4l16 16'],
  block: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M6 6l12 12'],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7v5l3 2'],
  star: ['M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6L3.4 9.3l6-.7z'],
  trash: ['M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13'],
  archive: ['M4 7h16v4H4z', 'M6 11v8h12v-8M10 15h4'],
  external: ['M14 4h6v6M20 4l-9 9M18 14v5H5V6h5'],
  copy: ['M9 9h10v11H9z', 'M5 15V4h10'],
}

export type IconName = keyof typeof P | 'dots'

export function Icon({ name, size = 22, color = colors.ink, stroke = 1.8 }: { name: IconName; size?: number; color?: string; stroke?: number }) {
  if (name === 'dots') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Circle cx={5} cy={12} r={1.6} fill={color} />
        <Circle cx={12} cy={12} r={1.6} fill={color} />
        <Circle cx={19} cy={12} r={1.6} fill={color} />
      </Svg>
    )
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {P[name].map((d, i) => (
        <Path key={i} d={d} stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {name === 'eye' && <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={stroke} />}
      {name === 'rocket' && <Circle cx={12} cy={9} r={1.4} fill={color} />}
    </Svg>
  )
}

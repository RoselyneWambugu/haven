import { describe, expect, it } from 'vitest'
import { activeChoices, clearAll, toggleIn, type FilterGroup } from '../src/lib/searchFilter'

function groups(state: { sort: string; when: string; langs: string[]; topic: string | null }): FilterGroup[] {
  return [
    { key: 'sort', title: 'Sort by', options: [{ value: 'next', label: 'Soonest' }, { value: 'price', label: 'Lowest price' }], value: state.sort, defaultValue: 'next', onChange: (v) => { state.sort = (v ?? 'next') as string } },
    { key: 'when', title: 'Available', options: [{ value: 'any', label: 'Any time' }, { value: 'now', label: 'Available now' }], value: state.when, defaultValue: 'any', onChange: (v) => { state.when = (v ?? 'any') as string } },
    { key: 'topic', title: 'Topic', options: [{ value: 'Grief', label: 'Grief' }], value: state.topic, defaultValue: null, onChange: (v) => { state.topic = v as string | null } },
    { key: 'language', title: 'Language', multi: true, options: [{ value: 'English', label: 'English' }, { value: 'Kiswahili', label: 'Kiswahili' }], value: state.langs, onChange: (v) => { state.langs = (v as string[]) ?? [] } },
  ]
}

describe('the filter dropdown', () => {
  it('counts nothing while every group sits on its default', () => {
    expect(activeChoices(groups({ sort: 'next', when: 'any', langs: [], topic: null }))).toEqual([])
  })

  it('lists what is switched on, one chip each, naming the sort', () => {
    const c = activeChoices(groups({ sort: 'price', when: 'now', langs: ['English', 'Kiswahili'], topic: 'Grief' }))
    expect(c.map((x) => x.label)).toEqual(['Sorted: Lowest price', 'Available now', 'Grief', 'English', 'Kiswahili'])
  })

  it('removes a single chip', () => {
    const state = { sort: 'price', when: 'now', langs: ['English', 'Kiswahili'], topic: 'Grief' as string | null }
    const c = activeChoices(groups(state))
    c.find((x) => x.label === 'Available now')!.remove()
    c.find((x) => x.label === 'English')!.remove()
    c.find((x) => x.label === 'Grief')!.remove()
    expect(state).toEqual({ sort: 'price', when: 'any', langs: ['Kiswahili'], topic: null })
  })

  it('puts everything back with clear all', () => {
    const state = { sort: 'price', when: 'now', langs: ['English'], topic: 'Grief' as string | null }
    clearAll(groups(state))
    expect(state).toEqual({ sort: 'next', when: 'any', langs: [], topic: null })
  })

  it('toggles a value in a many-choice group', () => {
    expect(toggleIn(null, 'a')).toEqual(['a'])
    expect(toggleIn(['a', 'b'], 'a')).toEqual(['b'])
  })
})

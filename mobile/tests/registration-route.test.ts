import { describe, expect, it } from 'vitest'
import { registrationRoute } from '../src/lib/registration'
import { maskContact } from '../src/lib/identity'

describe('carrying on with sign-up', () => {
  it('starts at the details when nothing is filled in', () => {
    expect(registrationRoute(null)).toBe('/register')
    expect(registrationRoute({ fullName: '', dob: '' })).toBe('/register')
  })
  it('goes on to the pen name once the details are in, for example after the email link is opened', () => {
    expect(registrationRoute({ fullName: 'Amina Otieno', dob: '1998-03-14T00:00:00.000Z' })).toBe('/pen-name')
  })
  it('asks for the details again when only a name was typed', () => {
    expect(registrationRoute({ fullName: 'Amina', dob: '' })).toBe('/register')
  })
})

describe('masking where a code was sent', () => {
  it('hides most of an email', () => {
    expect(maskContact('amina.otieno@gmail.com')).toBe('am••••••@gmail.com')
    expect(maskContact('jo@x.co')).toBe('jo•••@x.co')
  })
  it('still masks a phone number as a phone number', () => {
    expect(maskContact('+254712345678')).toBe('+254 712 ••• 678')
  })
})

import { dateToDob, dobToIso, isoToDob } from '../src/lib/identity'
describe('the date of birth picker', () => {
  it('turns a picked date into the form the rest of the app uses, and back', () => {
    expect(isoToDob('1998-03-14')).toBe('14/03/1998')
    expect(dobToIso('14/03/1998')).toBe('1998-03-14')
    expect(dobToIso('1/3/1998')).toBe('1998-03-01')
    expect(dateToDob(new Date(1998, 2, 14))).toBe('14/03/1998')
  })
  it('gives nothing for a date that isn’t one', () => {
    expect(isoToDob('')).toBe('')
    expect(isoToDob('14/03/1998')).toBe('')
    expect(dobToIso('31/02/1998')).toBe('')
    expect(dobToIso('')).toBe('')
  })
})

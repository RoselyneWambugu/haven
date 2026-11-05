import { describe, expect, it } from 'vitest'
import { passwordProblem, validEmail } from '../src/lib/password'

describe('passwords', () => {
  it('asks for length, a letter and a number', () => {
    expect(passwordProblem('short1')).toMatch(/8 characters/)
    expect(passwordProblem('onlyletters')).toMatch(/letter and one number/)
    expect(passwordProblem('12345678')).toMatch(/letter and one number/)
    expect(passwordProblem('a'.repeat(73) + '1')).toMatch(/72/)
    expect(passwordProblem('aaaaaaaa')).toMatch(/repeated/)
    expect(passwordProblem('quiet-river-42')).toBeNull()
  })

  it('refuses the email as the password', () => {
    expect(passwordProblem('wanjiru1', 'wanjiru1@example.com')).toMatch(/email/)
    expect(passwordProblem('wanjiru1@example.com', 'wanjiru1@example.com')).toMatch(/email/)
    expect(passwordProblem('quiet-river-42', 'wanjiru1@example.com')).toBeNull()
  })

  it('checks the shape of an email', () => {
    expect(validEmail(' me@example.com ')).toBe(true)
    expect(validEmail('me@')).toBe(false)
    expect(validEmail('no spaces@example.com')).toBe(false)
  })
})

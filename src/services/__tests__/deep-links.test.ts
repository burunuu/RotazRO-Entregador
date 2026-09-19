import { describe, expect, it } from 'vitest'
import { parseDeepLink } from '../deep-links'

describe('parseDeepLink', () => {
  it('parses a valid route share link', () => {
    const token = 'a'.repeat(40)
    expect(parseDeepLink(`https://rotazro.lovable.app/e/${token}`)).toEqual({
      kind: 'route',
      token,
    })
  })

  it('parses a valid auth confirm link, keeping search and hash separately', () => {
    expect(
      parseDeepLink('https://rotazro.lovable.app/auth/confirm?token_hash=abc&type=signup'),
    ).toEqual({ kind: 'auth_confirm', search: '?token_hash=abc&type=signup', hash: '' })

    expect(
      parseDeepLink(
        'https://rotazro.lovable.app/auth/confirm#access_token=live&refresh_token=rt&type=signup',
      ),
    ).toEqual({
      kind: 'auth_confirm',
      search: '',
      hash: '#access_token=live&refresh_token=rt&type=signup',
    })
  })

  it('rejects a URL on a different host — never trusts an unverified domain', () => {
    const token = 'a'.repeat(40)
    expect(parseDeepLink(`https://evil.example.com/e/${token}`)).toBeNull()
  })

  it('rejects a non-https scheme, including Capacitor-internal navigation', () => {
    expect(parseDeepLink('capacitor://localhost/e/token')).toBeNull()
    expect(parseDeepLink('http://rotazro.lovable.app/e/token')).toBeNull()
  })

  it('rejects a route link with no token', () => {
    expect(parseDeepLink('https://rotazro.lovable.app/e/')).toBeNull()
  })

  it('rejects an unrecognized path on the right host', () => {
    expect(parseDeepLink('https://rotazro.lovable.app/painel')).toBeNull()
  })

  it('rejects a completely malformed URL instead of throwing', () => {
    expect(parseDeepLink('not a url at all')).toBeNull()
  })
})

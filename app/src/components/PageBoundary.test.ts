import { describe, expect, it } from 'vitest'
import { isLoadFailure } from './PageBoundary'

describe('isLoadFailure', () => {
  it("knows each browser's words for a screen whose code did not arrive", () => {
    expect(isLoadFailure(new TypeError('Failed to fetch dynamically imported module: https://x/assets/SlipsPage-a1.js'))).toBe(true)
    expect(isLoadFailure(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(isLoadFailure(new TypeError('error loading dynamically imported module: https://x/a.js'))).toBe(true)
  })

  it('treats any other error as a crash of the screen', () => {
    expect(isLoadFailure(new Error("Cannot read properties of undefined (reading 'name')"))).toBe(false)
    expect(isLoadFailure(null)).toBe(false)
  })
})

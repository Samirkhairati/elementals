import { describe, expect, it } from 'vitest'
import { MAIN_VIEWS, cycleView, viewAt } from './views'

describe('views', () => {
  it('cycles forward and back and wraps around', () => {
    expect(cycleView('/editor', 1).url).toBe('/database')
    expect(cycleView('/editor', -1).url).toBe('/')
    expect(cycleView('/', -1).url).toBe(MAIN_VIEWS[MAIN_VIEWS.length - 1].url)
    expect(cycleView(MAIN_VIEWS[MAIN_VIEWS.length - 1].url, 1).url).toBe('/')
  })

  it('an unknown path starts from the first view', () => {
    expect(cycleView('/nowhere', 1).url).toBe(MAIN_VIEWS[1].url)
  })

  it('numbers views from 1', () => {
    expect(viewAt(1)?.url).toBe('/')
    expect(viewAt(2)?.url).toBe('/editor')
    expect(viewAt(99)).toBeUndefined()
  })
})

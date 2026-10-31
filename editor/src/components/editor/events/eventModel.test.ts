import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Command } from '../../../../../shared/engine/types'
import { createCommand, findCommand } from '../../../../../shared/engine/commands'
import {
  EVENT_TEMPLATES,
  addPage,
  applyTemplate,
  branchCommandCount,
  branchHeading,
  buildSummaryContext,
  buildValidationContext,
  collectProblems,
  conditionHoldsAtStart,
  countBySeverity,
  defaultActivePageIndex,
  deletePage,
  dropCommand,
  duplicatePage,
  freshCopies,
  getMemoryClipboard,
  insertCommands,
  movePage,
  moveWithin,
  orderedBranches,
  pageLabel,
  parseCommands,
  readCommandClipboard,
  removeBranch,
  removeCommandAndSelect,
  selectionAfterRemove,
  serializeCommands,
  setCommandParams,
  setMemoryClipboard,
  updatePage,
  validatePage,
  visibleOrder,
  worstSeverity,
  writeCommandClipboard,
} from './eventModel'
import { cmd, flat, makeEnv, page, sequentialIds } from './eventTestUtils'

const ids = sequentialIds('n')
beforeEach(() => {
  ids.start()
  setMemoryClipboard(null)
})
afterEach(() => ids.stop())

function sample(): Command[] {
  return [
    cmd('a', 'showText', { text: 'hi' }),
    cmd('b', 'showChoices', {}, { opt1: [cmd('b1', 'showText', { text: 'yes' })], opt2: [cmd('b2', 'wait')] }),
    cmd('c', 'wait'),
  ]
}

describe('pages', () => {
  it('adds, names and appends pages', () => {
    const base = [page('p1')]
    const r = addPage(base)
    expect(r.pages).toHaveLength(2)
    expect(r.pages[1].name).toBe('Page 2')
    expect(r.pages[1].id).toBe(r.id)
    expect(base).toHaveLength(1)
  })

  it('duplicates with fresh ids right after the original', () => {
    const p1 = page('p1', sample(), { name: 'Intro' })
    const r = duplicatePage([p1, page('p2')], 'p1')
    expect(r.pages.map((p) => p.id)).toEqual(['p1', r.id, 'p2'])
    const copy = r.pages[1]
    expect(copy.name).toBe('Intro copy')
    expect(flat(copy.commands)).toEqual(flat(p1.commands))
    const originalIds = new Set(flat(p1.commands, true))
    expect(flat(copy.commands, true).some((x) => originalIds.has(x))).toBe(false)
    expect(duplicatePage([p1], 'nope').id).toBeNull()
  })

  it('never deletes the last page', () => {
    const pages = [page('p1'), page('p2')]
    expect(deletePage(pages, 'p1').map((p) => p.id)).toEqual(['p2'])
    const single = [page('p1')]
    expect(deletePage(single, 'p1')).toBe(single)
    expect(deletePage(pages, 'zzz')).toBe(pages)
  })

  it('moves pages and refuses to leave the list', () => {
    const pages = [page('p1'), page('p2'), page('p3')]
    expect(movePage(pages, 'p2', -1).map((p) => p.id)).toEqual(['p2', 'p1', 'p3'])
    expect(movePage(pages, 'p2', 1).map((p) => p.id)).toEqual(['p1', 'p3', 'p2'])
    expect(movePage(pages, 'p1', -1)).toBe(pages)
    expect(movePage(pages, 'p3', 1)).toBe(pages)
  })

  it('updates one page immutably', () => {
    const pages = [page('p1'), page('p2')]
    const next = updatePage(pages, 'p2', { name: 'Second' })
    expect(next[1].name).toBe('Second')
    expect(next[0]).toBe(pages[0])
    expect(updatePage(pages, 'zzz', { name: 'x' })).toBe(pages)
  })

  it('labels pages by name or number', () => {
    expect(pageLabel({ name: '  ' }, 2)).toBe('Page 3')
    expect(pageLabel({ name: 'Intro' }, 0)).toBe('Intro')
  })

  it('finds the page that is active with no state set', () => {
    const vars = [{ id: 'badges', name: 'Badges', initial: 2 }]
    const pages = [
      page('p1'),
      page('p2', [], { conditions: [{ kind: 'switch', id: 'met', value: true }] }),
      page('p3', [], { conditions: [{ kind: 'variable', id: 'badges', op: '>=', value: 2 }] }),
      page('p4', [], { conditions: [{ kind: 'selfSwitch', key: 'A', value: true }] }),
    ]
    expect(defaultActivePageIndex(pages, vars)).toBe(2)
    expect(defaultActivePageIndex(pages, [])).toBe(0)
    expect(defaultActivePageIndex([page('x', [], { conditions: [{ kind: 'hasItem', item: 'potion', qty: 1 }] })], vars)).toBe(-1)
    expect(conditionHoldsAtStart({ kind: 'switch', id: 'met', value: false }, vars)).toBe(true)
    expect(conditionHoldsAtStart({ kind: 'variable', id: 'unknown', op: '==', value: 0 }, vars)).toBe(true)
  })
})

describe('command tree edits', () => {
  it('patches params and creates branches for new choice options', () => {
    const tree = sample()
    const options = [
      { id: 'opt1', label: 'Yes' },
      { id: 'opt2', label: 'No' },
      { id: 'opt3', label: 'Maybe' },
    ]
    const next = setCommandParams(tree, 'b', { options })
    const b = findCommand(next, 'b')!.command
    expect(b.params.options).toEqual(options)
    expect(Object.keys(b.branches ?? {})).toEqual(['opt1', 'opt2', 'opt3'])
    expect(b.branches?.opt1).toHaveLength(1)
    expect(findCommand(tree, 'b')!.command.params.options).not.toEqual(options)
  })

  it('prunes branches together with their commands', () => {
    const next = setCommandParams(sample(), 'b', { options: [{ id: 'opt1', label: 'Yes' }] }, ['opt2'])
    expect(flat(next)).toEqual(['showText', 'showChoices', 'showText', 'wait'])
    expect(findCommand(next, 'b2')).toBeNull()
    expect(Object.keys(findCommand(next, 'b')!.command.branches ?? {})).toEqual(['opt1'])
  })

  it('patches nested commands and returns the same tree for unknown ids', () => {
    const tree = sample()
    const next = setCommandParams(tree, 'b1', { text: 'changed' })
    expect(findCommand(next, 'b1')!.command.params.text).toBe('changed')
    expect(next[0]).toBe(tree[0])
    expect(setCommandParams(tree, 'zzz', { text: 'x' })).toBe(tree)
  })

  it('removes orphan branches', () => {
    const tree: Command[] = [{ ...cmd('l', 'loop'), branches: { body: [], gone: [cmd('g', 'wait')] } }]
    const next = removeBranch(tree, 'l', 'gone')
    expect(Object.keys(next[0].branches ?? {})).toEqual(['body'])
    expect(removeBranch(tree, 'l', 'nope')).toBe(tree)
  })

  it('inserts before, after and at the end of a branch', () => {
    const tree = sample()
    const x = cmd('x', 'wait')
    expect(flat(insertCommands(tree, { kind: 'before', id: 'a' }, [x]), true)[0]).toBe('wait:x')
    expect(flat(insertCommands(tree, { kind: 'after', id: 'a' }, [x]), true)[1]).toBe('wait:x')
    const end = insertCommands(tree, { kind: 'end', parentId: 'b', branch: 'opt2' }, [x])
    expect(findCommand(end, 'x')).toMatchObject({ parentId: 'b', branch: 'opt2', index: 1 })
    const root = insertCommands(tree, { kind: 'end', parentId: null, branch: null }, [x, cmd('y', 'wait')])
    expect(root.map((c) => c.id)).toEqual(['a', 'b', 'c', 'x', 'y'])
    expect(insertCommands(tree, { kind: 'after', id: 'missing' }, [x])).toBe(tree)
    expect(insertCommands(tree, { kind: 'end', parentId: 'missing', branch: 'x' }, [x])).toBe(tree)
  })

  it('moves within a list and stops at the edges', () => {
    const tree = sample()
    expect(moveWithin(tree, 'a', 1).map((c) => c.id)).toEqual(['b', 'a', 'c'])
    expect(moveWithin(tree, 'c', -1).map((c) => c.id)).toEqual(['a', 'c', 'b'])
    expect(moveWithin(tree, 'a', -1)).toBe(tree)
    expect(moveWithin(tree, 'c', 1)).toBe(tree)
    expect(moveWithin(tree, 'zzz', 1)).toBe(tree)
  })

  describe('dropCommand', () => {
    it('moves before / after a row in the same list', () => {
      const tree = sample()
      expect(dropCommand(tree, 'a', { kind: 'after', id: 'c' }).map((c) => c.id)).toEqual(['b', 'c', 'a'])
      expect(dropCommand(tree, 'c', { kind: 'before', id: 'a' }).map((c) => c.id)).toEqual(['c', 'a', 'b'])
      expect(dropCommand(tree, 'a', { kind: 'before', id: 'c' }).map((c) => c.id)).toEqual(['b', 'a', 'c'])
    })

    it('is a no-op for the current position and for itself', () => {
      const tree = sample()
      expect(dropCommand(tree, 'a', { kind: 'before', id: 'a' })).toBe(tree)
      expect(dropCommand(tree, 'a', { kind: 'before', id: 'b' })).toBe(tree)
      expect(dropCommand(tree, 'b', { kind: 'after', id: 'a' })).toBe(tree)
      expect(dropCommand(tree, 'c', { kind: 'end', parentId: null, branch: null })).toBe(tree)
    })

    it('moves across branches', () => {
      const tree = sample()
      const next = dropCommand(tree, 'a', { kind: 'end', parentId: 'b', branch: 'opt2' })
      expect(findCommand(next, 'a')).toMatchObject({ parentId: 'b', branch: 'opt2', index: 1 })
      const out = dropCommand(tree, 'b1', { kind: 'after', id: 'c' })
      expect(out.map((c) => c.id)).toEqual(['a', 'b', 'c', 'b1'])
    })

    it('refuses to move a command into its own subtree', () => {
      const tree = sample()
      expect(dropCommand(tree, 'b', { kind: 'end', parentId: 'b', branch: 'opt1' })).toBe(tree)
      expect(dropCommand(tree, 'b', { kind: 'after', id: 'b1' })).toBe(tree)
    })
  })

  it('removes a command and chooses the next selection', () => {
    const tree = sample()
    const none = new Set<string>()
    expect(selectionAfterRemove(tree, 'a', none)).toBe('b')
    expect(selectionAfterRemove(tree, 'c', none)).toBe('b2')
    expect(selectionAfterRemove([cmd('only', 'wait')], 'only', none)).toBeNull()
    // removing a container skips its own children
    expect(selectionAfterRemove(tree, 'b', none)).toBe('c')
    const r = removeCommandAndSelect(tree, 'b', none)
    expect(r.select).toBe('c')
    expect(r.tree.map((c) => c.id)).toEqual(['a', 'c'])
    expect(selectionAfterRemove(tree, 'zzz', none)).toBeNull()
  })

  it('lists visible rows, hiding collapsed subtrees', () => {
    const tree = sample()
    expect(visibleOrder(tree, new Set())).toEqual(['a', 'b', 'b1', 'b2', 'c'])
    expect(visibleOrder(tree, new Set(['b']))).toEqual(['a', 'b', 'c'])
  })

  it('exposes branches in order, including orphans that hold commands', () => {
    const c: Command = { ...cmd('x', 'showChoices', { cancel: 'branch' }), branches: { opt1: [], opt2: [], cancel: [], old: [cmd('o', 'wait')], empty: [] } }
    const views = orderedBranches(c)
    expect(views.map((v) => `${v.id}:${v.active}`)).toEqual(['opt1:true', 'opt2:true', 'cancel:true', 'old:false'])
    expect(branchHeading(c, views[0])).toBe('Choice: Yes')
    expect(branchHeading(c, views[2])).toBe('When cancelled')
    expect(branchHeading(c, views[3])).toContain('never runs')
    const cond = createCommand('conditional', {}, () => 'k')
    const [then, els] = orderedBranches(cond)
    expect([branchHeading(cond, then), branchHeading(cond, els)]).toEqual(['Then', 'Else'])
    const loop = createCommand('loop', {}, () => 'l')
    expect(branchHeading(loop, orderedBranches(loop)[0])).toBe('Loop body')
  })

  it('counts commands inside a branch recursively', () => {
    const tree = [cmd('b', 'showChoices', {}, { opt1: [cmd('x', 'loop', {}, { body: [cmd('y', 'wait'), cmd('z', 'wait')] })], opt2: [] })]
    expect(branchCommandCount(tree[0], 'opt1')).toBe(3)
    expect(branchCommandCount(tree[0], 'opt2')).toBe(0)
    expect(branchCommandCount(tree[0], 'nope')).toBe(0)
  })
})

describe('clipboard', () => {
  it('round-trips commands through the text format', () => {
    const text = serializeCommands(sample())
    const parsed = parseCommands(text)
    expect(parsed && flat(parsed)).toEqual(flat(sample()))
  })

  it('rejects anything that is not a list of known commands', () => {
    expect(parseCommands('not json')).toBeNull()
    expect(parseCommands('{"format":"other","commands":[]}')).toBeNull()
    expect(parseCommands(JSON.stringify({ format: 'elementals/commands', commands: [] }))).toBeNull()
    expect(parseCommands(JSON.stringify({ format: 'elementals/commands', commands: [{ id: 'a', type: 'nonsense', params: {} }] }))).toBeNull()
    expect(parseCommands(JSON.stringify({ format: 'elementals/commands', commands: [{ id: 'a', type: 'wait', params: [] }] }))).toBeNull()
  })

  it('pastes copies with fresh ids', () => {
    const copies = freshCopies(sample())
    expect(flat(copies)).toEqual(flat(sample()))
    const old = new Set(flat(sample(), true))
    expect(flat(copies, true).some((x) => old.has(x))).toBe(false)
  })

  it('keeps an in-memory fallback when the system clipboard is unavailable', async () => {
    await writeCommandClipboard([cmd('a', 'wait', { ms: 42 })])
    const read = await readCommandClipboard()
    expect(read?.[0].params.ms).toBe(42)
    expect(getMemoryClipboard()).not.toBeNull()
    setMemoryClipboard(null)
    expect(await readCommandClipboard()).toBeNull()
  })
})

describe('templates', () => {
  it('offers the documented snippets', () => {
    expect(EVENT_TEMPLATES.map((t) => t.label)).toEqual(['Dialogue', 'Yes / No question', 'Give item & hide', 'Warp', 'Open chest'])
  })

  it('builds fresh, valid commands every time', () => {
    for (const t of EVENT_TEMPLATES) {
      const a = t.build()
      const b = t.build()
      expect(a.commands.length).toBeGreaterThan(0)
      expect(a.commands[0].id).not.toBe(b.commands[0].id)
      const p = page('p', a.commands)
      expect(validatePage(p, {}).commandIssues.filter((i) => i.severity === 'error')).toEqual([])
    }
  })

  it('yes/no fills both choice branches', () => {
    const t = EVENT_TEMPLATES.find((x) => x.id === 'yes-no')!.build()
    const choices = t.commands[1]
    expect(choices.type).toBe('showChoices')
    expect(choices.branches?.opt1).toHaveLength(1)
    expect(choices.branches?.opt2).toHaveLength(1)
  })

  it('applies at the target and adds extra pages only to single-page events', () => {
    const tpl = EVENT_TEMPLATES.find((x) => x.id === 'chest')!
    const r = applyTemplate([page('p1', [cmd('a', 'wait')])], 'p1', tpl, { kind: 'before', id: 'a' })
    expect(r.pages).toHaveLength(2)
    expect(r.pages[0].commands.map((c) => c.type)).toEqual(['giveItem', 'showText', 'setSelfSwitch', 'wait'])
    expect(r.pages[1].conditions).toEqual([{ kind: 'selfSwitch', key: 'A', value: true }])
    expect(r.pages[1].appearance).toEqual({ frame: 1 })
    expect(r.selectId).toBe(r.pages[0].commands[0].id)
    const again = applyTemplate(r.pages, 'p1', tpl)
    expect(again.pages).toHaveLength(2)
    expect(applyTemplate(r.pages, 'zzz', tpl).pages).toBe(r.pages)
  })

  it('give item & hide adds a page that hides the entity', () => {
    const r = applyTemplate([page('p1')], 'p1', EVENT_TEMPLATES.find((x) => x.id === 'give-item')!)
    expect(r.pages[1]).toMatchObject({ solid: false, appearance: { visible: false } })
  })
})

describe('contexts and problems', () => {
  const env = makeEnv()

  it('builds name lookups', () => {
    const ctx = buildSummaryContext(env)
    expect(ctx.switchName?.('met')).toBe('Met the guard')
    expect(ctx.variableName?.('badges')).toBe('Badges earned')
    expect(ctx.mapName?.('town')).toBe('Town')
    expect(ctx.spriteName?.('objects/chest')).toBe('Chest')
    expect(ctx.entityName?.('e2')).toBe('Guard')
    expect(ctx.switchName?.('nope')).toBeUndefined()
  })

  it('builds validation id lists', () => {
    expect(buildValidationContext(env)).toEqual({
      switchIds: ['met', 'door'],
      variableIds: ['badges'],
      mapIds: ['town', 'cave'],
      spriteIds: ['characters/hero', 'objects/chest'],
      entityIds: ['self-1', 'e2'],
    })
  })

  it('collects problems from conditions, appearance and commands, errors first', () => {
    const pages = [
      page('p1', [cmd('w', 'warp', { map: '' }), cmd('s', 'setSwitch', { id: 'ghost' })], {
        conditions: [{ kind: 'switch', id: 'ghost2', value: true }],
        appearance: { asset: 'objects/missing' },
      }),
      page('p2'),
    ]
    const problems = collectProblems(pages, buildValidationContext(env))
    expect(problems[0].severity).toBe('error')
    expect(problems.map((p) => p.code)).toEqual(expect.arrayContaining(['dangling-switch', 'missing-param', 'dangling-sprite']))
    expect(problems.every((p) => p.pageId === 'p1')).toBe(true)
    expect(problems.find((p) => p.scope === 'conditions')).toBeDefined()
    expect(problems.find((p) => p.scope === 'appearance')).toBeDefined()
    expect(problems.find((p) => p.commandId === 's')).toBeDefined()
    const counts = countBySeverity(problems)
    expect(counts.errors).toBeGreaterThan(0)
    expect(counts.warnings).toBeGreaterThan(0)
    expect(worstSeverity([])).toBeNull()
    expect(worstSeverity([{ severity: 'warning' }])).toBe('warning')
    expect(worstSeverity([{ severity: 'warning' }, { severity: 'error' }])).toBe('error')
  })
})

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { PLAYER_FIXTURE, PLAYER_GRAPHICS, buildAssets, decodePng, encodePng, recolourPixel } from './gen-placeholder-sprites.mjs'
import { validateCharacter } from '../../shared/engine/characters.ts'
import { spriteMetaToCharacter } from '../../shared/engine/characterMigrate.ts'

const readPlayer = (f) => fs.readFileSync(f === 'sprite.json' ? PLAYER_FIXTURE : path.join(PLAYER_GRAPHICS, f))
const files = buildAssets(readPlayer)
const ids = Object.keys(files)
  .filter((f) => f.startsWith('database/characters/'))
  .map((f) => f.slice('database/characters/'.length, -'.json'.length))

describe('placeholder sprite generator', () => {
  test('is deterministic', () => {
    const again = buildAssets(readPlayer)
    assert.deepEqual(Object.keys(again), Object.keys(files))
    for (const [k, v] of Object.entries(files)) assert.ok(v.equals(again[k]), `${k} differs between runs`)
  })

  test('produces the expected assets', () => {
    assert.deepEqual([...ids].sort(), [
      'characters/npc-blue',
      'characters/npc-green',
      'characters/npc-red',
      'objects/chest',
      'objects/door',
      'objects/flower',
      'objects/item-ball',
      'objects/sign',
    ])
  })

  test('PNG codec round-trips', () => {
    const img = { width: 3, height: 2, data: new Uint8Array([1, 2, 3, 255, 0, 0, 0, 0, 9, 8, 7, 128, 4, 5, 6, 255, 10, 11, 12, 255, 13, 14, 15, 1]) }
    assert.deepEqual(decodePng(encodePng(img)), img)
  })

  for (const id of ids) {
    test(`${id}: a valid character whose sheets tile exactly`, () => {
      const def = JSON.parse(files[`database/characters/${id}.json`].toString())
      assert.deepEqual(validateCharacter(def).errors, [])
      for (const sheet of Object.values(def.sheets)) {
        const img = decodePng(files[`graphics/${sheet.image}`])
        assert.equal(img.width % sheet.frameWidth, 0, `${sheet.image} width`)
        assert.equal(img.height % sheet.frameHeight, 0, `${sheet.image} height`)
        if (def.facing === 'four') {
          assert.equal(img.width / sheet.frameWidth, def.clips.walk.byFacing.down.length)
          assert.equal(img.height / sheet.frameHeight, 4)
        }
        assert.ok(img.data.some((v, i) => i % 4 === 3 && v > 0), `${sheet.image} is not empty`)
      }
    })
  }

  test('object frame counts and the flower animation', () => {
    const sheet = (id) => decodePng(files[`graphics/sprites/${id}/sheet.png`])
    assert.equal(sheet('objects/sign').width, 32)
    assert.equal(sheet('objects/item-ball').width, 32)
    assert.equal(sheet('objects/chest').width, 64)
    assert.equal(sheet('objects/door').width, 64)
    assert.equal(sheet('objects/flower').width, 96)
    const flower = JSON.parse(files['database/characters/objects/flower.json'].toString())
    assert.equal(flower.facing, 'none')
    assert.deepEqual(flower.clips.sway, { sheet: 'sheet', fps: 4, loop: true, directional: false, frames: [0, 1, 2, 1] })
  })

  test('NPCs keep the player layout and differ from it in colour only', () => {
    const player = spriteMetaToCharacter('characters/player', JSON.parse(readPlayer('sprite.json').toString()))
    const playerWalk = decodePng(readPlayer('walk.png'))
    for (const key of ['npc-red', 'npc-blue', 'npc-green']) {
      const def = JSON.parse(files[`database/characters/characters/${key}.json`].toString())
      const swapImages = (d) => JSON.parse(JSON.stringify(d).replaceAll(`sprites/characters/${key}/`, 'sprites/characters/player/'))
      assert.deepEqual({ ...swapImages(def), name: player.name }, player)
      const walk = decodePng(files[`graphics/sprites/characters/${key}/walk.png`])
      assert.equal(walk.width, playerWalk.width)
      let differing = 0
      for (let i = 0; i < walk.width * walk.height; i++) {
        assert.equal(walk.data[i * 4 + 3], playerWalk.data[i * 4 + 3], 'alpha is untouched')
        if (walk.data[i * 4] !== playerWalk.data[i * 4] || walk.data[i * 4 + 2] !== playerWalk.data[i * 4 + 2]) differing++
      }
      assert.ok(differing > 500, `${key} should recolour a good part of the sprite`)
    }
  })

  test('recolour keeps outline, white and skin, shifts the cap', () => {
    const scheme = { primary: { hue: 120 }, secondary: { hue: 120 } }
    assert.deepEqual(recolourPixel([0, 0, 0], scheme), [0, 0, 0])
    assert.deepEqual(recolourPixel([232, 232, 248], scheme), [232, 232, 248])
    assert.deepEqual(recolourPixel([216, 144, 112], scheme), [216, 144, 112])
    const [r, g] = recolourPixel([248, 104, 72], scheme)
    assert.ok(g > r, 'cap highlight turns green')
  })
})

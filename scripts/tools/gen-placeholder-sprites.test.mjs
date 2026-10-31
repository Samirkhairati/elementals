import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { PROJECT_SPRITES, buildAssets, decodePng, encodePng, recolourPixel } from './gen-placeholder-sprites.mjs'
import { validateSpriteMeta } from '../../shared/engine/sprites.ts'
import { validateSpriteMeta as strictValidate } from '../../editor/electron/ipc/spriteMeta.ts'

const playerDir = path.join(PROJECT_SPRITES, 'characters/player')
const readPlayer = (f) => fs.readFileSync(path.join(playerDir, f))
const files = buildAssets(readPlayer)
const ids = Object.keys(files)
  .filter((f) => f.endsWith('/sprite.json'))
  .map((f) => f.slice(0, -'/sprite.json'.length))

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
    test(`${id}: valid metadata and sheets tile exactly`, () => {
      const meta = JSON.parse(files[`${id}/sprite.json`].toString())
      assert.deepEqual(validateSpriteMeta(meta).errors, [])
      assert.deepEqual(strictValidate(meta).errors ?? [], [])
      const sheets = meta.kind === 'character' ? Object.values(meta.character.sheets) : [meta.sheet]
      for (const file of sheets) {
        const img = decodePng(files[`${id}/${file}`])
        assert.equal(img.width % meta.frameWidth, 0, `${file} width`)
        assert.equal(img.height % meta.frameHeight, 0, `${file} height`)
        if (meta.kind === 'character') {
          assert.equal(img.width / meta.frameWidth, meta.character.framesPerDirection)
          assert.equal(img.height / meta.frameHeight, 4)
        }
        assert.ok(img.data.some((v, i) => i % 4 === 3 && v > 0), `${file} is not empty`)
      }
    })
  }

  test('object frame counts and the flower animation', () => {
    const sheet = (id) => decodePng(files[`${id}/sheet.png`])
    assert.equal(sheet('objects/sign').width, 32)
    assert.equal(sheet('objects/item-ball').width, 32)
    assert.equal(sheet('objects/chest').width, 64)
    assert.equal(sheet('objects/door').width, 64)
    assert.equal(sheet('objects/flower').width, 96)
    const flower = JSON.parse(files['objects/flower/sprite.json'].toString())
    assert.equal(flower.kind, 'animated')
    assert.deepEqual(flower.animations.sway, { frames: [0, 1, 2, 1], fps: 4, loop: true })
  })

  test('NPCs keep the player layout and differ from it in colour only', () => {
    const player = JSON.parse(readPlayer('sprite.json').toString())
    const playerWalk = decodePng(readPlayer('walk.png'))
    for (const key of ['npc-red', 'npc-blue', 'npc-green']) {
      const meta = JSON.parse(files[`characters/${key}/sprite.json`].toString())
      assert.deepEqual({ ...meta, name: player.name }, player)
      const walk = decodePng(files[`characters/${key}/walk.png`])
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

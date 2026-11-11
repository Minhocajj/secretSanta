import { describe, expect, it } from 'vitest'
import { SNOWMAN_MOVES, snowmanMove } from './friends'

describe('snowmanMove', () => {
  it('gives each snowman a different first move', () => {
    expect([0, 1, 2].map((index) => snowmanMove(index, 1))).toEqual(['hop', 'wave', 'hat'])
  })

  it('cycles through every move as the same snowman is clicked again', () => {
    expect([1, 2, 3, 4, 5].map((clicks) => snowmanMove(0, clicks))).toEqual(['hop', 'wave', 'hat', 'twirl', 'hop'])
  })

  it('always answers with a known move, even for unexpected input', () => {
    for (const [index, clicks] of [[-3, 0], [0, 0], [2, 99], [7, 1]]) {
      expect(SNOWMAN_MOVES).toContain(snowmanMove(index, clicks))
    }
  })
})

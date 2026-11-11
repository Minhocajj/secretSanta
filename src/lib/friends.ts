export const SNOWMAN_MOVES = ['hop', 'wave', 'hat', 'twirl'] as const

export type SnowmanMove = (typeof SNOWMAN_MOVES)[number]

export function snowmanMove(index: number, clicks: number): SnowmanMove {
  const step = Math.max(0, index) + Math.max(1, clicks) - 1
  return SNOWMAN_MOVES[step % SNOWMAN_MOVES.length]
}

// The worker's loops, by name. Side-effect free (no imports, nothing started),
// so a unit test can read the set without booting the worker. 037 T4 reduces
// this to `retention`.
export const LOOPS = ['scheduler', 'retention'] as const
export type LoopName = (typeof LOOPS)[number]

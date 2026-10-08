// 测试用：模拟一个完整的回合——（可选）先有一条提示，再开始回合，最后结束回合。
import type { On } from 'claude-code'

type TestEngine = {
  prompt: { submit: (input: never) => Promise<unknown> }
  turn: { start: (input: never) => Promise<unknown>; complete: (input: never) => Promise<unknown> }
}

type Complete = { turnId: string; answer: string; reason: string; [key: string]: unknown }

// 引擎底层：回合开始、提示提交都照常放行（测试自己接管 prompt.submit 时传 submit: false）
export function stubTurns(on: On, options: { submit?: boolean } = {}): void {
  on('turn.start', (_$, e) => Promise.resolve({ turnId: e.turnId }))
  if (options.submit !== false) on('prompt.submit', (_$, e) => Promise.resolve({ text: e.text } as never))
}

// origin 省略时不发提示，只开始一个带文字的回合（相当于宿主不报 prompt.submit）
export async function finishTurn(
  $: TestEngine,
  input: Complete,
  options: { origin?: { kind: string; [key: string]: unknown }; text?: string } = {},
): Promise<void> {
  const text = options.text ?? '帮我做点事'
  if (options.origin !== undefined) await $.prompt.submit({ text, origin: options.origin, wait: false } as never)
  await $.turn.start({ text, turnId: input.turnId } as never)
  await $.turn.complete(input as never)
}

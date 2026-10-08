// 重复弹窗：子代理回合、弹窗未关时又有回合结束、同一回合重复触发。
import { expect, test } from 'claude-code/testing'
import { finishTurn, stubTurns } from './turns'
import type { On } from 'claude-code'

const REPLY = JSON.stringify([{ label: '跑测试', prompt: '运行测试' }])
const LONG = '这是一段足够长的回答。'.repeat(20)

// 弹窗不立即作答：每次打开记一笔，等测试手动关闭
function wire(on: On) {
  const opened: string[] = []
  const closers: (() => void)[] = []
  on('turn.complete', () => Promise.resolve({ text: '' }))
  stubTurns(on)
  on('command.list', () => Promise.resolve({ value: [] } as never))
  on('model.fork', () => Promise.resolve({ value: { isAnswered: true, text: REPLY, usage: {} } } as never))
  on('ui.log', () => Promise.resolve({ value: undefined } as never))
  on('prompt.fill', () => Promise.resolve({ isFilled: true } as never))
  on('tool.call', { tool: 'AskUserQuestion' }, () => {
    opened.push('dialog')
    return new Promise(resolve => closers.push(() => resolve({ deny: 'dismissed' } as never)))
  })
  return { opened, closeAll: () => closers.splice(0).forEach(close => close()) }
}

async function settle(): Promise<void> {
  for (let i = 0; i < 500; i++) await Promise.resolve()
}

const turn = (turnId: string, agentId?: string) =>
  ({ answer: LONG, durationMs: 1, isAborted: false, turnId, reason: 'answer', ...(agentId ? { agentId } : {}) }) as const

test('子代理的回合结束：不弹窗', async ($, on) => {
  const w = wire(on)
  await finishTurn($, turn('sub-1', 'agent-1'))
  await settle()
  expect(w.opened.length).toBe(0)
})

test('弹窗还开着时另一回合结束：不再叠一个弹窗', async ($, on) => {
  const w = wire(on)
  await finishTurn($, turn('t1'))
  await settle()
  await finishTurn($, turn('t2'))
  await settle()
  expect(w.opened.length).toBe(1)
  w.closeAll()
  await settle()
})

test('同一回合的 turn.complete 到达两次：只弹一次', async ($, on) => {
  const w = wire(on)
  await finishTurn($, turn('t1'))
  await settle()
  w.closeAll()
  await settle()
  await finishTurn($, turn('t1'))
  await settle()
  expect(w.opened.length).toBe(1)
})

test('正常情况：每个主回合各弹一次', async ($, on) => {
  const w = wire(on)
  await finishTurn($, turn('t1'))
  await settle()
  w.closeAll()
  await settle()
  await finishTurn($, turn('t2'))
  await settle()
  expect(w.opened.length).toBe(2)
  w.closeAll()
  await settle()
})

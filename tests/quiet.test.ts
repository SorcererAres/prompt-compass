// 少打扰：只在本人发了消息、AI 回答完之后弹窗；自动开启的回合不弹，本人正在打字时不弹。
import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import { finishTurn, stubTurns } from './turns'

const REPLY = JSON.stringify([{ label: '跑测试', prompt: '运行测试' }])
const LONG = '这是一段足够长的回答。'.repeat(20)

function wire(on: On, box = '') {
  const seen = { asked: 0 }
  on('turn.complete', () => Promise.resolve({ text: '' }))
  stubTurns(on)
  on('command.list', () => Promise.resolve({ value: [] } as never))
  on('model.fork', () => Promise.resolve({ value: { isAnswered: true, text: REPLY, usage: {} } } as never))
  on('ui.log', () => Promise.resolve({ value: undefined } as never))
  on('prompt.read', () => Promise.resolve({ value: { text: box, cursor: box.length } } as never))
  on('tool.call', { tool: 'AskUserQuestion' }, () => {
    seen.asked += 1
    return Promise.resolve({ deny: 'dismissed' } as never)
  })
  return seen
}

async function settle(): Promise<void> {
  for (let i = 0; i < 500; i++) await Promise.resolve()
}

const done = (turnId: string) => ({ answer: LONG, durationMs: 1, isAborted: false, turnId, reason: 'answer' })

test('本人在输入框发的消息（composer）：弹窗', async ($, on) => {
  const seen = wire(on)
  await finishTurn($, done('t1'), { origin: { kind: 'composer' } })
  await settle()
  expect(seen.asked).toBe(1)
})

test('通过手机等远程客户端发的消息（bridge）：弹窗', async ($, on) => {
  const seen = wire(on)
  await finishTurn($, done('t1'), { origin: { kind: 'bridge' } })
  await settle()
  expect(seen.asked).toBe(1)
})

for (const kind of ['task-notification', 'scheduled-trigger', 'peer', 'auto-continuation', 'unclassified', 'channel']) {
  test(`自动开启的回合（${kind}）：不弹窗`, async ($, on) => {
    const seen = wire(on)
    await finishTurn($, done('t1'), { origin: { kind } })
    await settle()
    expect(seen.asked).toBe(0)
  })
}

test('插件以本人的话发出的提示（autoSubmit 选中的那条）：弹窗', async ($, on) => {
  const seen = wire(on)
  await finishTurn($, done('t1'), { origin: { kind: 'plugin', name: 'prompt-compass', asUser: true } })
  await settle()
  expect(seen.asked).toBe(1)
})

test('插件以自己名义发出的提示：不弹窗', async ($, on) => {
  const seen = wire(on)
  await finishTurn($, done('t1'), { origin: { kind: 'plugin', name: 'other' } })
  await settle()
  expect(seen.asked).toBe(0)
})

test('没有文字的续跑回合：不弹窗', async ($, on) => {
  const seen = wire(on)
  await finishTurn($, done('t1'), { origin: { kind: 'composer' }, text: '' })
  await settle()
  expect(seen.asked).toBe(0)
})

test('后台通知开启的回合里本人插了话：算本人的回合，弹窗', async ($, on) => {
  const seen = wire(on)
  await $.prompt.submit({ text: '任务完成', origin: { kind: 'task-notification' }, wait: false } as never)
  await $.turn.start({ text: '任务完成', turnId: 't1' } as never)
  await $.prompt.submit({ text: '顺便把测试也跑一下', origin: { kind: 'composer' }, turnId: 't1', wait: false } as never)
  await $.turn.complete(done('t1') as never)
  await settle()
  expect(seen.asked).toBe(1)
})

test('本人的回合之后紧跟一个自动回合：只为本人的回合弹一次', async ($, on) => {
  const seen = wire(on)
  await finishTurn($, done('t1'), { origin: { kind: 'composer' } })
  await settle()
  await finishTurn($, done('t2'), { origin: { kind: 'task-notification' } })
  await settle()
  expect(seen.asked).toBe(1)
})

test('本人已经在输入框里打字：不弹窗', async ($, on) => {
  const seen = wire(on, '我想先')
  await finishTurn($, done('t1'), { origin: { kind: 'composer' } })
  await settle()
  expect(seen.asked).toBe(0)
})

test('输入框只有空白：照常弹窗', async ($, on) => {
  const seen = wire(on, '   ')
  await finishTurn($, done('t1'), { origin: { kind: 'composer' } })
  await settle()
  expect(seen.asked).toBe(1)
})

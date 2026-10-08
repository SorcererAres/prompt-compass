// 边界情况：何时不给建议、模型输出不可信时的清洗与过滤、弹窗的各种作答方式。
import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const QUESTION = '接下来做什么？'
const LONG_ANSWER = '这是一段足够长的回答。'.repeat(20)

type Setup = {
  // fork 的回复文本；null 表示 fork 没有作答
  reply: string | null
  // 弹窗的答案；null 表示弹窗被关闭
  pick?: string | null
  commands?: { name: string; description: string; source: string }[]
}

type Seen = { forks: number; asked: string[] | null; filled: string[] }

function wire(on: On, setup: Setup): Seen {
  const seen: Seen = { forks: 0, asked: null, filled: [] }
  on('turn.complete', () => Promise.resolve({ text: '' }))
  on('command.list', () => Promise.resolve({ value: setup.commands ?? [] } as never))
  on('model.fork', () => {
    seen.forks += 1
    return Promise.resolve({
      value:
        setup.reply === null
          ? { isAnswered: false, reason: 'nothing-to-fork' }
          : { isAnswered: true, text: setup.reply, usage: {} },
    } as never)
  })
  on('ui.log', () => Promise.resolve({ value: undefined } as never))
  on('prompt.suggest', () => Promise.resolve({ isShown: true } as never))
  on('tool.call', { tool: 'AskUserQuestion' }, (_$, e) => {
    const questions = (e as unknown as { questions: { question: string; options: { label: string }[] }[] }).questions
    seen.asked = questions[0]?.options.map(o => o.label) ?? []
    if (setup.pick === null) return Promise.resolve({ deny: 'dismissed' } as never)
    return Promise.resolve({ result: { questions, answers: { [QUESTION]: setup.pick ?? '' } } } as never)
  })
  on('prompt.fill', (_$, e) => {
    seen.filled.push(e.text)
    return Promise.resolve({ isFilled: true } as never)
  })
  return seen
}

async function settle(): Promise<void> {
  for (let i = 0; i < 500; i++) await Promise.resolve()
}

const turn = (answer = LONG_ANSWER, reason: 'answer' | 'aborted' = 'answer') =>
  ({ answer, durationMs: 1, isAborted: reason === 'aborted', turnId: 't1', reason }) as const

const json = (items: unknown) => JSON.stringify(items)

test('回答太短：不调用 fork、不弹窗', async ($, on) => {
  const seen = wire(on, { reply: json([{ label: 'a', prompt: 'a' }]) })
  await $.turn.complete(turn('好的'))
  await settle()
  expect(seen.forks).toBe(0)
  expect(seen.asked).toBeNull()
})

test('minAnswerChars 选项生效：调低后短回答也给建议', { options: { minAnswerChars: 1 } }, async ($, on) => {
  const seen = wire(on, { reply: json([{ label: '继续', prompt: '继续' }]), pick: '继续' })
  await $.turn.complete(turn('好的'))
  await settle()
  expect(seen.forks).toBe(1)
  expect(seen.filled).toEqual(['继续'])
})

test('被中断的回合：不给建议', async ($, on) => {
  const seen = wire(on, { reply: json([{ label: 'a', prompt: 'a' }]) })
  await $.turn.complete(turn(LONG_ANSWER, 'aborted'))
  await settle()
  expect(seen.forks).toBe(0)
})

test('fork 没有作答：不弹窗', async ($, on) => {
  const seen = wire(on, { reply: null })
  await $.turn.complete(turn())
  await settle()
  expect(seen.forks).toBe(1)
  expect(seen.asked).toBeNull()
})

test('模型输出不是 JSON：不弹窗', async ($, on) => {
  const seen = wire(on, { reply: '我觉得你可以运行测试。' })
  await $.turn.complete(turn())
  await settle()
  expect(seen.asked).toBeNull()
})

test('空列表：不弹窗', async ($, on) => {
  const seen = wire(on, { reply: '[]' })
  await $.turn.complete(turn())
  await settle()
  expect(seen.asked).toBeNull()
})

test('JSON 外有多余文字也能解析', async ($, on) => {
  const seen = wire(on, { reply: `好的，建议如下：\n${json([{ label: '跑测试', prompt: '运行测试' }])}\n以上。`, pick: '跑测试' })
  await $.turn.complete(turn())
  await settle()
  expect(seen.filled).toEqual(['运行测试'])
})

test('最多三条，外加「暂不需要」', async ($, on) => {
  const items = ['一', '二', '三', '四', '五'].map(n => ({ label: n, prompt: `第${n}条` }))
  const seen = wire(on, { reply: json(items), pick: null })
  await $.turn.complete(turn())
  await settle()
  expect(seen.asked).toEqual(['一', '二', '三', '暂不需要'])
})

test('不存在的斜杠命令被丢弃，存在的保留', async ($, on) => {
  const seen = wire(on, {
    reply: json([
      { label: '审查', prompt: '/code-review high' },
      { label: '瞎编', prompt: '/no-such-skill do it' },
      { label: '普通', prompt: '运行测试' },
    ]),
    commands: [{ name: 'code-review', description: 'review', source: 'plugin' }],
    pick: '审查',
  })
  await $.turn.complete(turn())
  await settle()
  expect(seen.asked).toEqual(['审查', '普通', '暂不需要'])
  expect(seen.filled).toEqual(['/code-review high'])
})

test('终端转义序列与控制字符被清除；含 Unicode tag 字符的条目被拒绝', async ($, on) => {
  const seen = wire(on, {
    reply: json([
      { label: '\u001b[31m红色\u001b[0m', prompt: '运行\u0007测试​' },
      { label: '隐藏', prompt: `正常文字\u{E0041}\u{E0042}` },
    ]),
    pick: '红色',
  })
  await $.turn.complete(turn())
  await settle()
  expect(seen.asked).toEqual(['红色', '暂不需要'])
  expect(seen.filled).toEqual(['运行测试'])
})

test('标签重复：去重后再映射', async ($, on) => {
  const seen = wire(on, {
    reply: json([
      { label: '测试', prompt: '运行单元测试' },
      { label: '测试', prompt: '运行集成测试' },
    ]),
    pick: '测试',
  })
  await $.turn.complete(turn())
  await settle()
  expect(seen.asked).toEqual(['测试', '暂不需要'])
  expect(seen.filled).toEqual(['运行单元测试'])
})

test('没有 label 时用 prompt 充当标签', async ($, on) => {
  const seen = wire(on, { reply: json([{ prompt: '提交这次改动' }]), pick: '提交这次改动' })
  await $.turn.complete(turn())
  await settle()
  expect(seen.filled).toEqual(['提交这次改动'])
})

test('在 Other 里自己输入：写入输入框', async ($, on) => {
  const seen = wire(on, { reply: json([{ label: '跑测试', prompt: '运行测试' }]), pick: '帮我写 changelog' })
  await $.turn.complete(turn())
  await settle()
  expect(seen.filled).toEqual(['帮我写 changelog'])
})

test('关闭弹窗：什么都不做，也不报错', async ($, on) => {
  const seen = wire(on, { reply: json([{ label: '跑测试', prompt: '运行测试' }]), pick: null })
  await $.turn.complete(turn())
  await settle()
  expect(seen.asked).toEqual(['跑测试', '暂不需要'])
  expect(seen.filled).toEqual([])
})

test('band 模式：不弹窗', { options: { display: 'band' } }, async ($, on) => {
  const seen = wire(on, { reply: json([{ label: '跑测试', prompt: '运行测试' }]) })
  await $.turn.complete(turn())
  await settle()
  expect(seen.forks).toBe(1)
  expect(seen.asked).toBeNull()
})

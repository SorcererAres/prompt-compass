/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
// 边界情况：何时不给建议、模型输出不可信时的清洗与过滤、弹窗的各种作答方式与显示。
import { expect, test } from 'claude-code/testing'
import { finishTurn, stubTurns } from './turns'
import type { On } from 'claude-code'

// 默认语言（en）下弹窗的文字
const QUESTION = 'What next?'
const DISMISS = 'Not now'
const LONG_ANSWER = '这是一段足够长的回答。'.repeat(20)

type Asked = { question: string; header: string; options: { label: string; description?: string }[]; multiSelect?: boolean }

// 测试主体的 $（带引擎的 ui.render），钩子里的 $ 是插件接口，没有它
type TestEngine = { ui: { render: (input: never) => Promise<unknown> } }

function drawDialog($: TestEngine, questions: Asked[]) {
  return $.ui.render({
    surface: 'desktop',
    component: 'AskUserQuestion',
    requestId: 'dialog',
    props: { tool: 'AskUserQuestion', questions },
  } as never)
}

type Setup = {
  // fork 的回复文本；null 表示 fork 没有作答
  reply: string | null
  // 弹窗的答案；null 表示弹窗被关闭
  pick?: string | null
  commands?: { name: string; description: string; source: string }[]
}

type Seen = {
  forks: number
  asked: string[] | null
  described: (string | undefined)[] | null
  header: string | null
  filled: string[]
  submitted: { text: string; asUser?: boolean }[]
}

function wire(engine: TestEngine, on: On, setup: Setup): Seen {
  const seen: Seen = { forks: 0, asked: null, described: null, header: null, filled: [], submitted: [] }
  on('turn.complete', () => Promise.resolve({ text: '' }))
  stubTurns(on, { submit: false })
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
  // 引擎底层的绘制：记下弹窗最终画出的问题（经过插件的 ui.render 钩子之后）
  on('ui.render', async ($, e) => {
    if (e.component === 'AskUserQuestion') {
      const q = (e.props as { questions: Asked[] }).questions[0]
      seen.described = q?.options.map(o => o.description) ?? []
    }
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  on('prompt.suggest', () => Promise.resolve({ isShown: true } as never))
  // 弹窗本身：像引擎一样先把它画出来，再按设定作答
  on('tool.call', { tool: 'AskUserQuestion' }, async (_$, e) => {
    const questions = (e as unknown as { questions: Asked[] }).questions
    seen.asked = questions[0]?.options.map(o => o.label) ?? []
    seen.header = questions[0]?.header ?? null
    await drawDialog(engine, questions)
    if (setup.pick === null) return Promise.resolve({ deny: 'dismissed' } as never)
    return Promise.resolve({ result: { questions, answers: { [questions[0]?.question ?? '']: setup.pick ?? '' } } } as never)
  })
  on('prompt.fill', (_$, e) => {
    seen.filled.push(e.text)
    return Promise.resolve({ isFilled: true } as never)
  })
  on('prompt.submit', (_$, e) => {
    seen.submitted.push({ text: e.text, asUser: (e.origin as { asUser?: boolean } | undefined)?.asUser })
    return Promise.resolve({ text: e.text } as never)
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
  const seen = wire($, on, { reply: json([{ label: 'a', prompt: 'a' }]) })
  await finishTurn($, turn('好的'))
  await settle()
  expect(seen.forks).toBe(0)
  expect(seen.asked).toBeNull()
})

test('minAnswerChars 选项生效：调低后短回答也给建议', { options: { minAnswerChars: 1 } }, async ($, on) => {
  const seen = wire($, on, { reply: json([{ label: '继续', prompt: '继续' }]), pick: '继续' })
  await finishTurn($, turn('好的'))
  await settle()
  expect(seen.forks).toBe(1)
  expect(seen.filled).toEqual(['继续'])
})

test('被中断的回合：不给建议', async ($, on) => {
  const seen = wire($, on, { reply: json([{ label: 'a', prompt: 'a' }]) })
  await finishTurn($, turn(LONG_ANSWER, 'aborted'))
  await settle()
  expect(seen.forks).toBe(0)
})

test('fork 没有作答：不弹窗', async ($, on) => {
  const seen = wire($, on, { reply: null })
  await finishTurn($, turn())
  await settle()
  expect(seen.forks).toBe(1)
  expect(seen.asked).toBeNull()
})

test('模型输出不是 JSON：不弹窗', async ($, on) => {
  const seen = wire($, on, { reply: '我觉得你可以运行测试。' })
  await finishTurn($, turn())
  await settle()
  expect(seen.asked).toBeNull()
})

test('空列表：不弹窗', async ($, on) => {
  const seen = wire($, on, { reply: '[]' })
  await finishTurn($, turn())
  await settle()
  expect(seen.asked).toBeNull()
})

test('JSON 外有多余文字也能解析', async ($, on) => {
  const seen = wire($, on, { reply: `好的，建议如下：\n${json([{ label: '跑测试', prompt: '运行测试' }])}\n以上。`, pick: '跑测试' })
  await finishTurn($, turn())
  await settle()
  expect(seen.filled).toEqual(['运行测试'])
})

test('最多三条，外加「Not now」', async ($, on) => {
  const items = ['一', '二', '三', '四', '五'].map(n => ({ label: n, prompt: `第${n}条` }))
  const seen = wire($, on, { reply: json(items), pick: null })
  await finishTurn($, turn())
  await settle()
  expect(seen.asked).toEqual(['一', '二', '三', DISMISS])
})

test('不存在的斜杠命令被丢弃，存在的保留', async ($, on) => {
  const seen = wire($, on, {
    reply: json([
      { label: '审查', prompt: '/code-review high' },
      { label: '瞎编', prompt: '/no-such-skill do it' },
      { label: '普通', prompt: '运行测试' },
    ]),
    commands: [{ name: 'code-review', description: 'review', source: 'plugin' }],
    pick: '审查',
  })
  await finishTurn($, turn())
  await settle()
  expect(seen.asked).toEqual(['审查', '普通', DISMISS])
  expect(seen.filled).toEqual(['/code-review high'])
})

test('终端转义序列与控制字符被清除；含 Unicode tag 字符的条目被拒绝', async ($, on) => {
  const seen = wire($, on, {
    reply: json([
      { label: '\u001b[31m红色\u001b[0m', prompt: '运行\u0007测试​' },
      { label: '隐藏', prompt: `正常文字\u{E0041}\u{E0042}` },
    ]),
    pick: '红色',
  })
  await finishTurn($, turn())
  await settle()
  expect(seen.asked).toEqual(['红色', DISMISS])
  expect(seen.filled).toEqual(['运行测试'])
})

test('标签重复：去重后再映射', async ($, on) => {
  const seen = wire($, on, {
    reply: json([
      { label: '测试', prompt: '运行单元测试' },
      { label: '测试', prompt: '运行集成测试' },
    ]),
    pick: '测试',
  })
  await finishTurn($, turn())
  await settle()
  expect(seen.asked).toEqual(['测试', DISMISS])
  expect(seen.filled).toEqual(['运行单元测试'])
})

test('没有 label 时用 prompt 充当标签', async ($, on) => {
  const seen = wire($, on, { reply: json([{ prompt: '提交这次改动' }]), pick: '提交这次改动' })
  await finishTurn($, turn())
  await settle()
  expect(seen.filled).toEqual(['提交这次改动'])
})

test('在 Other 里自己输入：写入输入框', async ($, on) => {
  const seen = wire($, on, { reply: json([{ label: '跑测试', prompt: '运行测试' }]), pick: '帮我写 changelog' })
  await finishTurn($, turn())
  await settle()
  expect(seen.filled).toEqual(['帮我写 changelog'])
})

test('关闭弹窗：什么都不做，也不报错', async ($, on) => {
  const seen = wire($, on, { reply: json([{ label: '跑测试', prompt: '运行测试' }]), pick: null })
  await finishTurn($, turn())
  await settle()
  expect(seen.asked).toEqual(['跑测试', DISMISS])
  expect(seen.filled).toEqual([])
})

test('band 模式：不弹窗', { options: { display: 'band' } }, async ($, on) => {
  const seen = wire($, on, { reply: json([{ label: '跑测试', prompt: '运行测试' }]) })
  await finishTurn($, turn())
  await settle()
  expect(seen.forks).toBe(1)
  expect(seen.asked).toBeNull()
})

test('弹窗选项的描述是完整提示', async ($, on) => {
  const seen = wire($, on, {
    reply: json([
      { label: '跑测试', prompt: '运行 tests/edge.test.ts 里的全部用例并报告失败原因' },
      { label: '提交', prompt: '把这次改动提交并推送到 GitHub' },
    ]),
    pick: null,
  })
  await finishTurn($, turn())
  await settle()
  expect(seen.header).toBe('Next step')
  expect(seen.described).toEqual([
    '运行 tests/edge.test.ts 里的全部用例并报告失败原因',
    '把这次改动提交并推送到 GitHub',
    'Close without doing anything',
  ])
})

test('autoSubmit 打开：选中后直接按本人的话发送，不写草稿', { options: { autoSubmit: true } }, async ($, on) => {
  const seen = wire($, on, { reply: json([{ label: '提交', prompt: '把这次改动提交并推送' }]), pick: '提交' })
  await finishTurn($, turn())
  await settle()
  expect(seen.header).toBe('Next · send')
  expect(seen.filled).toEqual([])
  expect(seen.submitted).toEqual([{ text: '把这次改动提交并推送', asUser: true }])
})

test('autoSubmit 打开：Other 里输入的文字也直接发送', { options: { autoSubmit: true } }, async ($, on) => {
  const seen = wire($, on, { reply: json([{ label: '提交', prompt: '提交' }]), pick: '写一份 changelog' })
  await finishTurn($, turn())
  await settle()
  expect(seen.submitted.map(s => s.text)).toEqual(['写一份 changelog'])
})

test('autoSubmit 打开：选「Not now」或关闭弹窗都不发送', { options: { autoSubmit: true } }, async ($, on) => {
  const seen = wire($, on, { reply: json([{ label: '提交', prompt: '提交' }]), pick: DISMISS })
  await finishTurn($, turn())
  await settle()
  expect(seen.submitted).toEqual([])
  expect(seen.filled).toEqual([])
})

test('autoSubmit 关闭（默认）：只写草稿，不发送', async ($, on) => {
  const seen = wire($, on, { reply: json([{ label: '提交', prompt: '把这次改动提交' }]), pick: '提交' })
  await finishTurn($, turn())
  await settle()
  expect(seen.submitted).toEqual([])
  expect(seen.filled).toEqual(['把这次改动提交'])
})

test('其他来源的 AskUserQuestion 弹窗不被改动', async ($, on) => {
  const seen = wire($, on, { reply: null })
  // 没有等待作答的建议时，即使问题文字相同也原样绘制
  for (const question of ['选个颜色？', QUESTION]) {
    await $.ui.render({
      surface: 'desktop',
      component: 'AskUserQuestion',
      requestId: 'model',
      props: {
        tool: 'AskUserQuestion',
        questions: [{ question, header: 'Next step', options: [{ label: '红', description: '' }, { label: '蓝', description: '' }], multiSelect: false }],
      },
    })
    expect(seen.described).toEqual(['', ''])
  }
})

// 关闭弹窗时，宿主可能不是拒绝，而是把一段系统提示当作「答案」返回；它不是本人写的，不能写入或发送
for (const notice of [
  '[User dismissed — do not proceed, wait for next instruction]',
  '[Request interrupted by user]',
  'User declined to answer questions',
]) {
  for (const autoSubmit of [false, true]) {
    test(`关闭弹窗返回系统提示「${notice.slice(0, 20)}…」：不写入也不发送（autoSubmit=${autoSubmit}）`, { options: { autoSubmit } }, async ($, on) => {
      const seen = wire($, on, { reply: json([{ label: '跑测试', prompt: '运行测试' }]), pick: notice })
      await finishTurn($, turn())
      await settle()
      expect(seen.asked).toEqual(['跑测试', DISMISS])
      expect(seen.filled).toEqual([])
      expect(seen.submitted).toEqual([])
    })
  }
}

test('Other 里正常输入的文字不受影响（含方括号但不是整段包住）', async ($, on) => {
  const seen = wire($, on, { reply: json([{ label: '跑测试', prompt: '运行测试' }]), pick: '把 [TODO] 都列出来' })
  await finishTurn($, turn())
  await settle()
  expect(seen.filled).toEqual(['把 [TODO] 都列出来'])
})

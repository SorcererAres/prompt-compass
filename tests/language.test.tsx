/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
// 界面语言：language 选项 en（默认）/ zh / auto（跟随本人最近一条消息）。
import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import { finishTurn, stubTurns } from './turns'

const REPLY = JSON.stringify([{ label: 'L1', prompt: '完整提示一' }])
const LONG = '这是一段足够长的回答。'.repeat(20)

type Asked = { question: string; header: string; options: { label: string; description?: string }[] }
type TestEngine = { ui: { render: (input: never) => Promise<unknown> } }

type Seen = {
  question: string | null
  header: string | null
  labels: string[] | null
  descriptions: (string | undefined)[] | null
  filled: string[]
}

// 弹窗：像引擎一样先画出来（经过插件的 ui.render 钩子），再按 pick 作答
function wire(engine: TestEngine, on: On, pick: string | null = null): Seen {
  const seen: Seen = { question: null, header: null, labels: null, descriptions: null, filled: [] }
  on('turn.complete', () => Promise.resolve({ text: '' }))
  stubTurns(on)
  on('command.list', () => Promise.resolve({ value: [] } as never))
  on('model.fork', () => Promise.resolve({ value: { isAnswered: true, text: REPLY, usage: {} } } as never))
  on('ui.log', () => Promise.resolve({ value: undefined } as never))
  on('prompt.suggest', () => Promise.resolve({ isShown: true } as never))
  on('ui.render', async ($, e) => {
    if (e.component === 'AskUserQuestion') {
      seen.descriptions = (e.props as { questions: Asked[] }).questions[0]?.options.map(o => o.description) ?? []
    }
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  on('tool.call', { tool: 'AskUserQuestion' }, async (_$, e) => {
    const questions = (e as unknown as { questions: Asked[] }).questions
    const q = questions[0]
    seen.question = q?.question ?? null
    seen.header = q?.header ?? null
    seen.labels = q?.options.map(o => o.label) ?? []
    await engine.ui.render({
      surface: 'desktop',
      component: 'AskUserQuestion',
      requestId: 'dialog',
      props: { tool: 'AskUserQuestion', questions },
    } as never)
    if (pick === null) return { deny: 'dismissed' } as never
    return { result: { questions, answers: { [q?.question ?? '']: pick } } } as never
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

const done = (turnId: string) => ({ answer: LONG, durationMs: 1, isAborted: false, turnId, reason: 'answer' })
const composer = (text: string) => ({ origin: { kind: 'composer' }, text })

const EN = {
  question: 'What next?',
  header: 'Next step',
  dismiss: 'Not now',
  dismissDescription: 'Close without doing anything',
}
const ZH = {
  question: '接下来做什么？',
  header: '下一步',
  dismiss: '暂不需要',
  dismissDescription: '关闭，不做任何事',
}

test('默认英文：问题、标题、关闭选项与其描述', async ($, on) => {
  const seen = wire($, on)
  await finishTurn($, done('t1'), composer('帮我把测试跑一下'))
  await settle()
  expect(seen.question).toBe(EN.question)
  expect(seen.header).toBe(EN.header)
  expect(seen.labels).toEqual(['L1', EN.dismiss])
  expect(seen.descriptions).toEqual(['完整提示一', EN.dismissDescription])
})

test('language=zh：中文问题、标题、关闭选项与其描述', { options: { language: 'zh' } }, async ($, on) => {
  const seen = wire($, on)
  await finishTurn($, done('t1'), composer('run the tests'))
  await settle()
  expect(seen.question).toBe(ZH.question)
  expect(seen.header).toBe(ZH.header)
  expect(seen.labels).toEqual(['L1', ZH.dismiss])
  expect(seen.descriptions).toEqual(['完整提示一', ZH.dismissDescription])
})

test('language=zh + autoSubmit：标题为「下一步·直接发送」', { options: { language: 'zh', autoSubmit: true } }, async ($, on) => {
  const seen = wire($, on)
  await finishTurn($, done('t1'), composer('run the tests'))
  await settle()
  expect(seen.header).toBe('下一步·直接发送')
})

test('英文 autoSubmit 标题不超过 12 个字符', { options: { autoSubmit: true } }, async ($, on) => {
  const seen = wire($, on)
  await finishTurn($, done('t1'), composer('run the tests'))
  await settle()
  expect(seen.header).toBe('Next · send')
  expect([...(seen.header ?? '')].length <= 12).toBe(true)
})

for (const [label, lang] of [
  ['en', EN],
  ['zh', ZH],
] as const) {
  test(`language=${label}：选关闭选项什么都不做，选建议照常写入`, { options: { language: label } }, async ($, on) => {
    const dismissed = wire($, on, lang.dismiss)
    await finishTurn($, done('t1'), composer('hi there, please continue'))
    await settle()
    expect(dismissed.filled).toEqual([])
  })
}

test('language=zh：选中建议照常写入完整提示', { options: { language: 'zh' } }, async ($, on) => {
  const seen = wire($, on, 'L1')
  await finishTurn($, done('t1'), composer('run the tests'))
  await settle()
  expect(seen.filled).toEqual(['完整提示一'])
})

for (const [message, expected] of [
  ['帮我把测试跑一下', ZH],
  ['run the tests please', EN],
  ['把 README 推到 GitHub 上', ZH],
  ['把 v0.5.1 推到 GitHub，然后更新本机的 prompt-compass 到 0.5.1', ZH],
  ['fix the failing test in src/parser.ts', EN],
  ['rename the 文 variable in utils.ts to something clearer', EN],
] as const) {
  test(`language=auto：「${message}」→ ${expected === ZH ? '中文' : '英文'}`, { options: { language: 'auto' } }, async ($, on) => {
    const seen = wire($, on)
    await finishTurn($, done('t1'), composer(message))
    await settle()
    expect(seen.question).toBe(expected.question)
    expect(seen.labels).toEqual(['L1', expected.dismiss])
  })
}

test('language=auto：跟着最近一条消息切换', { options: { language: 'auto' } }, async ($, on) => {
  const seen = wire($, on)
  await finishTurn($, done('t1'), composer('帮我把测试跑一下'))
  await settle()
  expect(seen.question).toBe(ZH.question)
  await finishTurn($, done('t2'), composer('now update the changelog'))
  await settle()
  expect(seen.question).toBe(EN.question)
})

test('非法的 language 值按默认英文处理', { options: { language: 'fr' } }, async ($, on) => {
  const seen = wire($, on)
  await finishTurn($, done('t1'), composer('帮我把测试跑一下'))
  await settle()
  expect(seen.question).toBe(EN.question)
})

// 按钮行模式：输入框上方的标题、关闭按钮与加载提示也按语言显示
for (const surface of ['terminal', 'desktop'] as const) {
  for (const language of ['en', 'zh'] as const) {
    const title = { terminal: { en: 'next:', zh: '下一步：' }, desktop: { en: 'Next', zh: '下一步' } }[surface][language]
    const loading = {
      terminal: { en: 'next steps…', zh: '正在生成…' },
      desktop: { en: 'Generating suggestions…', zh: '正在生成下一步建议…' },
    }[surface][language]

    test(`${surface} 按钮行 language=${language}：标题「${title}」与加载提示「${loading}」`, { options: { display: 'band', language } }, async ($, on) => {
      let release: () => void = () => undefined
      on('turn.complete', () => Promise.resolve({ text: '' }))
      stubTurns(on)
      on('command.list', () => Promise.resolve({ value: [] } as never))
      on('ui.log', () => Promise.resolve({ value: undefined } as never))
      on('prompt.suggest', () => Promise.resolve({ isShown: true } as never))
      // fork 先挂起，看加载提示；放行后看建议
      on('model.fork', () => new Promise(resolve => {
        release = () => resolve({ value: { isAnswered: true, text: REPLY, usage: {} } } as never)
      }))
      on('ui.render', async ($, e) => {
        const { Box } = $.ui.resolve(e)
        return <Box key="engine" />
      })
      const props = { hasSurvey: false, isWorking: false, maxRows: 20 } as never

      await finishTurn($, done('t1'), composer('hello'))
      await settle()
      const during = await $.ui.mount({ plugin: 'prompt-compass', surface, component: 'AbovePrompt', props })
      expect(await during.find({ type: 'Text', text: loading })).toBeDefined()
      await during.unmount()

      release()
      await settle()
      const after = await $.ui.mount({ plugin: 'prompt-compass', surface, component: 'AbovePrompt', props })
      expect(await after.find({ type: 'Text', text: title })).toBeDefined()
      expect(await after.find({ key: 's0' })).toBeDefined()
      expect(await after.find({ key: 'dismiss' })).toBeDefined()
      await after.unmount()
    })
  }
}

// 建议是以本人口吻写的，不能替本人声称做过、看到过或确认过什么（比如「我重启了」「测试通过了」）：
// 生成提示词里要求模型别这么写，模型仍写了的，解析时丢掉。
import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import { finishTurn, stubTurns } from './turns'

const LONG = '这是一段足够长的回答。'.repeat(20)

function wire(on: On, suggestions: { label: string; prompt: string }[]) {
  const seen = { forkPrompt: '', asked: [] as string[], filled: [] as string[] }
  on('turn.complete', () => Promise.resolve({ text: '' }))
  stubTurns(on)
  on('command.list', () => Promise.resolve({ value: [] } as never))
  on('model.fork', (_$, e) => {
    seen.forkPrompt = (e as { prompt: string }).prompt
    return Promise.resolve({ value: { isAnswered: true, text: JSON.stringify(suggestions), usage: {} } } as never)
  })
  on('ui.log', () => Promise.resolve({ value: undefined } as never))
  on('prompt.fill', (_$, e) => {
    seen.filled.push(e.text)
    return Promise.resolve({ isFilled: true } as never)
  })
  on('tool.call', { tool: 'AskUserQuestion' }, (_$, e) => {
    const q = (e as unknown as { questions: { question: string; options: { label: string }[] }[] }).questions
    seen.asked = q[0]?.options.map(o => o.label) ?? []
    return Promise.resolve({ deny: 'dismissed' } as never)
  })
  return seen
}

async function settle(): Promise<void> {
  for (let i = 0; i < 500; i++) await Promise.resolve()
}

const done = { answer: LONG, durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' }
const DISMISS = 'Not now'

test('生成提示词要求：只写要 Claude 做什么，不替本人声称做过或确认过什么', async ($, on) => {
  const seen = wire(on, [{ label: 'a', prompt: '运行测试' }])
  await finishTurn($, done, { origin: { kind: 'composer' }, text: '帮我改一下' })
  await settle()
  expect(seen.forkPrompt).toContain('request for Claude')
  expect(seen.forkPrompt).toContain('Never state or imply what the user has done')
})

// 以本人口吻声称已经做了、看到了或确认了某事：丢掉
for (const prompt of [
  '我重启了 Claude Code，帮我确认这个会话现在加载的是 prompt-compass 0.5.3',
  '我已经重启了，帮我看看弹窗是不是中文',
  '我刚改了 README，帮我再检查一遍',
  '我测试过了，没问题，推到 GitHub',
  '直接发送测试通过了，把 settings.json 里的两个临时配置删掉',
  '实测通过了，发 v0.5.3',
  'I restarted Claude Code, confirm the session loaded 0.5.3',
  "I've already tested it, push it to GitHub",
  'I just ran the tests and they passed, now open a PR',
  'Tests passed, so publish the release',
] as const) {
  test(`丢弃替本人声称的建议：「${prompt.slice(0, 24)}…」`, async ($, on) => {
    const seen = wire(on, [
      { label: '声称', prompt },
      { label: '正常', prompt: '运行测试并报告失败原因' },
    ])
    await finishTurn($, done, { origin: { kind: 'composer' }, text: '帮我改一下' })
    await settle()
    expect(seen.asked).toEqual(['正常', DISMISS])
  })
}

// 只是请求或指令，没有替本人声称什么：保留
for (const prompt of [
  '重启 Claude Code 后帮我确认加载的是 0.5.3',
  '帮我确认这个会话加载的是 prompt-compass 0.5.3',
  '跑一下测试，看看是否全部通过了',
  '我想把弹窗改成英文',
  '检查我改的 README 有没有问题',
  'Restart the dev server and check the logs',
  'Make sure it works on the desktop app',
  'Check whether the tests passed on CI',
  'I want the dialog in English',
] as const) {
  test(`保留正常请求：「${prompt.slice(0, 24)}」`, async ($, on) => {
    const seen = wire(on, [{ label: '请求', prompt }])
    await finishTurn($, done, { origin: { kind: 'composer' }, text: '帮我改一下' })
    await settle()
    expect(seen.asked).toEqual(['请求', DISMISS])
  })
}

test('全部建议都是替本人声称的：不弹窗', async ($, on) => {
  const seen = wire(on, [{ label: '声称', prompt: '我重启了，帮我确认一下' }])
  await finishTurn($, done, { origin: { kind: 'composer' }, text: '帮我改一下' })
  await settle()
  expect(seen.asked).toEqual([])
})

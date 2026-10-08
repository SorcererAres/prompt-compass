/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
// 验证：turn 结束后建议能在终端与桌面两种界面的 AbovePrompt 中画出，点击后填入输入框。
import { expect, test } from 'claude-code/testing'

const SUGGESTIONS = JSON.stringify([
  { label: '运行测试', prompt: '运行刚写的测试' },
  { label: '提交代码', prompt: '提交这次改动' },
])

async function settle(): Promise<void> {
  for (let i = 0; i < 50; i++) await Promise.resolve()
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}：显示建议并填入输入框`, async ($, on) => {
    const filled: string[] = []
    on('turn.complete', () => Promise.resolve({ text: '' }))
    on('command.list', () => Promise.resolve({ value: [] }))
    on('model.fork', () => Promise.resolve({ value: { isAnswered: true, text: SUGGESTIONS, usage: {} } } as never))
    on('ui.log', () => Promise.resolve({ value: undefined } as never))
    on('ui.render', async ($, e) => {
      const { Box } = $.ui.resolve(e)
      return <Box key="engine" />
    })
    on('prompt.suggest', () => Promise.resolve({ isShown: true } as never))
    on('prompt.fill', (_$, e) => {
      filled.push(e.text)
      return Promise.resolve({ isFilled: true } as never)
    })

    await $.turn.complete({ answer: '这是一段足够长的回答。'.repeat(20), durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
    await settle()

    const ui = await $.ui.mount({
      plugin: 'next-steps-app',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 20 } as never,
    })
    expect(await ui.find({ key: 's0' })).toBeDefined()
    expect(await ui.find({ key: 's1' })).toBeDefined()
    expect(await ui.find({ key: 'dismiss' })).toBeDefined()

    await ui.press({ key: 's1' })
    expect(filled).toEqual(['提交这次改动'])
    expect(await ui.find({ key: 's0' })).toBeUndefined()
    await ui.unmount()
  })
}

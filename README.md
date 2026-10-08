# prompt-compass

每轮对话结束后给出最多三条「下一步」建议。**终端和 Claude 桌面 App 的 Code tab 都能用。**

默认用 Claude Code 自带的问答弹窗（与 Claude 向你提问时的选择框相同）；也可以改为输入框上方的一行按钮。

基于 [anthropics/claude-plugins-community](https://github.com/anthropics/claude-plugins-community/tree/main/next-steps) 中 Thariq Shihipar 的 `next-steps` 插件改写。原版只在终端绘制，本版本按界面分支渲染，让桌面 App 也能显示。

## English

**prompt-compass** suggests up to three likely next prompts after each Claude Code turn, in both the terminal and the Code tab of the Claude desktop app.

By default the suggestions appear in Claude Code's built-in question dialog, each option showing its full prompt as the description. Pick one and that prompt is written into the prompt box as an editable draft; text typed under "Other" is written there too, and "暂不需要" (not now) or closing the dialog does nothing. Turn on `autoSubmit` to send the chosen prompt right away instead (dialog mode only, since only the dialog shows the full text). In dialog mode nothing is drawn above the prompt box, not even a loading hint. Set the `display` option to `band` to show the suggestions as a row of buttons above the prompt box instead. The plugin never submits a prompt on its own.

When it appears: only after you send a message (typed in the prompt box, or from a remote client) and Claude finishes answering it. Turns that start on their own, such as background-task notifications, scheduled tasks, messages from other sessions or automatic continuations, never trigger it, nor do subagent turns. It never opens while you are already typing, never stacks a second dialog on an open one, and handles each turn at most once.

How it works: when a turn ends, the plugin forks the current session with `$.model.fork` (sharing the prompt cache, so it costs about one short reply) and asks the model for likely next prompts. The session's skill and slash-command names are included so a suggestion can be `/skill arguments`; a suggestion naming a command the session does not have is dropped. Model output is treated as untrusted: escape sequences, control and invisible characters are stripped before anything is shown. The plugin makes no network requests of its own and runs no shell commands.

Options: `display` (`dialog` or `band`), `autoSubmit` (default false), `minAnswerChars` (skip suggestions after shorter answers, default 80), `suggestSkills` (default true).

Based on the MIT-licensed `next-steps` plugin by Thariq Shihipar in anthropics/claude-plugins-community.

## 安装

在 Claude Code 中：

```
/plugin marketplace add SorcererAres/prompt-compass
/plugin install prompt-compass@prompt-compass
```

或在命令行：

```bash
claude plugin marketplace add SorcererAres/prompt-compass
```

```bash
claude plugin install prompt-compass@prompt-compass
```

如果同时装了原版 `next-steps`，建议先停用它，避免终端里出现两份建议：

```bash
claude plugin disable next-steps@claude-community
```

安装后新开的会话自动生效。

## 效果

### 什么时候出现

只在**你发了一条消息、Claude 回答完之后**出现（在输入框发送，或从手机等远程客户端发送）。以下情况都不会出现，以免在 AI 干活过程中打扰你：

- 后台任务通知、定时任务、其他会话的消息、自动续跑等自动开启的回合；
- 子代理（如 Explore、Agent）的回合；
- 你已经在输入框里打字时；
- 已经有一个建议弹窗开着时（不会叠加），同一回合也只处理一次。

### 弹窗模式（默认，`display: dialog`）

回答结束后弹出「下一步」问答框：

- 列出最多三条建议，外加「暂不需要」；每个选项的描述是它的完整提示，选之前就能看到全部文字。弹窗自带的「Other」可以自己输入。
- 选中一条：默认把完整提示作为草稿写入输入框，你可以编辑后自己按 Enter 发送。
- 打开 `autoSubmit` 后，选中即直接发送（弹窗标题变为「下一步·直接发送」以示区别）。
- 在「Other」里输入的文字同样处理；选「暂不需要」或关闭弹窗则什么都不做。
- 弹窗模式不在输入框上方画任何东西，生成建议期间也不显示加载提示。
- 注意：弹窗会占用键盘直到你作答或关闭；嫌打扰可以改用按钮行，或调高 `minAnswerChars`。

### 按钮行模式（`display: band`）

**桌面 App（Code tab）**：输入框上方出现「下一步」标题行（右侧为关闭），下面每条建议一行，第一条为主按钮，右侧角标是数字热键。

**终端**：与原版一致：

```
next:
  1: run the tests you just wrote
  2: do the same for the settings page
  3: /code-review high
  0: dismiss
```

- 点击建议（或按 `1`、`2`、`3`），该建议作为草稿写入输入框；`0` 或关闭按钮收起建议。
- 第一条建议同时作为输入框的灰色提示，按 `Tab` 直接采用。

**默认不会自动发送任何提示。** 只有在弹窗模式下打开 `autoSubmit`，并且你在弹窗里亲自选中一条时才会发送；按钮行模式只显示短标签、看不到完整提示，因此始终只写草稿。

## 工作原理

函数钩子插件（`hooks/register.tsx`）：

- `turn.complete`：用 `$.model.fork` 分叉当前会话，请模型预测接下来最可能的提示。分叉共享会话的提示缓存，成本约等于一条简短回复。
- `$.command.list`：把会话中可用的 skill 与斜杠命令交给分叉，所以建议可以是 `/skill 参数`；不存在的命令会被丢弃。
- 弹窗模式：`$.ui.ask` 打开引擎自带的 AskUserQuestion 弹窗；`ui.render`（`AskUserQuestion`）钩子在绘制本插件自己的那个弹窗时给选项补上描述（完整提示），其他弹窗原样放行。选中后调用 `$.prompt.fill`，或在 `autoSubmit` 打开时调用 `$.prompt.submit`。
- 按钮行模式：`ui.render`（`AbovePrompt`）按 `e.surface` 分支绘制：终端为纯文本热键行，桌面为原生按钮列表；选中时调用 `$.prompt.fill`，第一条建议同时交给 `$.prompt.suggest`。
- `prompt.submit` / `turn.start`：记下每个回合是不是由你发的消息开启的（按提示来源区分：`composer`、`bridge` 算你的，后台通知、定时任务等不算）；新一轮开始时隐藏建议。
- 弹窗前用 `$.prompt.read` 看一眼输入框，你正在打字就不弹。
- 模型输出视为不可信文本：显示前会清除终端转义序列、控制字符、不可见字符等。

按钮行模式依赖输入框上方的区域，VS Code 扩展与手机 App 目前没有这块区域，因此不显示。

## 选项

| 选项 | 默认值 | 作用 |
| --- | --- | --- |
| `display` | `dialog` | `dialog`：问答弹窗；`band`：输入框上方的按钮行 |
| `autoSubmit` | `false` | 仅弹窗模式：选中后直接发送，而不是写入输入框 |
| `minAnswerChars` | `80` | 回答短于该字符数时不给建议 |
| `suggestSkills` | `true` | 是否把会话可用的 skill 与斜杠命令告诉建议生成器 |

修改：`/plugin configure prompt-compass@prompt-compass`

## 开发

```bash
claude plugin validate .
```

```bash
claude plugin test .
```

测试覆盖：按钮行模式在终端与桌面两种界面的显示、点击与收起；弹窗模式的选项、选中、Other 输入与关闭；以及边界情况：短回答或中断的回合不给建议、模型输出非 JSON 或为空、超过三条截断、不存在的斜杠命令被丢弃、终端转义与控制字符清除、标签去重；弹窗选项的描述为完整提示、其他来源的弹窗不被改动；autoSubmit 打开时直接按本人的话发送、关闭时只写草稿；何时弹窗：只在你发起的回合之后，自动开启的回合、子代理回合、正在打字、弹窗已开、同一回合重复时都不弹。

## 许可

MIT。原作 © Thariq Shihipar，桌面适配 © SorcererAres。

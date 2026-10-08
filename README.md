# prompt-compass

每轮对话结束后给出最多三条「下一步」建议。**终端和 Claude 桌面 App 的 Code tab 都能用。**

默认用 Claude Code 自带的问答弹窗（与 Claude 向你提问时的选择框相同）；也可以改为输入框上方的一行按钮。

基于 [anthropics/claude-plugins-community](https://github.com/anthropics/claude-plugins-community/tree/main/next-steps) 中 Thariq Shihipar 的 `next-steps` 插件改写。原版只在终端绘制，本版本按界面分支渲染，让桌面 App 也能显示。

## English

**prompt-compass** suggests up to three likely next prompts after each Claude Code turn, in both the terminal and the Code tab of the Claude desktop app.

By default the suggestions appear in Claude Code's built-in question dialog, each option showing its full prompt as the description. Pick one and that prompt is written into the prompt box as an editable draft; text typed under "Other" is written there too, and "Not now" or closing the dialog does nothing. Turn on `autoSubmit` to send the chosen prompt right away instead (dialog mode only, since only the dialog shows the full text). In dialog mode nothing is drawn above the prompt box, not even a loading hint. The dialog and buttons are in English by default; set `language` to `zh` for Chinese, or `auto` to follow the language of your latest message. Set the `display` option to `band` to show the suggestions as a row of buttons above the prompt box instead. Nothing is ever sent unless you pick an option yourself with `autoSubmit` turned on.

When it appears: only after you send a message (typed in the prompt box, or from a remote client) and Claude finishes answering it. Turns that start on their own, such as background-task notifications, scheduled tasks, messages from other sessions or automatic continuations, never trigger it, nor do subagent turns. It never opens while you are already typing, never stacks a second dialog on an open one, and handles each turn at most once. If its dialog is answered only after a new turn has already started (for example because it was queued behind another dialog), the answer is stale and is ignored.

How it works: when a turn ends, the plugin forks the current session with `$.model.fork` (sharing the prompt cache, so it costs about one short reply) and asks the model for likely next prompts. The session's skill and slash-command names are included so a suggestion can be `/skill arguments`; a suggestion naming a command the session does not have is dropped. Suggestions are written in your voice and may be sent as your own words, so each one must be a request for Claude to do something: the plugin tells the model never to claim things on your behalf ("I restarted it", "the tests passed"), and drops any suggestion that still does. Model output is treated as untrusted: escape sequences, control and invisible characters are stripped before anything is shown. The plugin makes no network requests of its own and runs no shell commands.

### What it runs, sends and changes

1. **Sending prompts (`autoSubmit`, off by default).** With `autoSubmit` off, the plugin only writes a draft into the prompt box and never sends anything. With it on, the plugin sends a prompt only after you pick that option in the dialog, where its full text is shown; it is sent as your own words (`$.prompt.submit` with `asUser: true`, so Claude does not see a "sent by a plugin" frame, though the transcript still records the plugin as its origin). Text you type under "Other" is sent the same way. Closing the dialog sends nothing, including when Claude Code reports the close as a text notice such as "[User dismissed …]": the plugin recognizes those notices and ignores them. In `band` mode it never sends, because the buttons show only short labels.
2. **Changing how a dialog is drawn.** A `ui.render` hook on `AskUserQuestion` adds descriptions (the full prompts) to the options of the plugin's own dialog, identified by its question and header while a set of suggestions is waiting for an answer. Every other `AskUserQuestion` dialog, including Claude's own questions to you, is drawn unchanged. Answers are still matched by label, so this changes only what is shown.
3. **Where the data goes and what it costs.** To get suggestions the plugin calls `$.model.fork`, which re-sends the session's own transcript as the main thread last sent it, plus one short instruction, over Claude Code's existing model connection. Nothing goes anywhere the session does not already send it. Each suggestion round is one extra tool-less model request, usually served from the prompt cache, and it counts toward your usage. The plugin stores nothing on disk and keeps no history between sessions.
4. **Where it works.** Only in Claude Code: the terminal and the Code tab of the Claude desktop app. It is built on Claude Code's function-hooks plugin API, so it has no effect in claude.ai chat or Cowork. The `band` mode needs the area above the prompt box, which the VS Code extension and the mobile app do not have yet.

Options: `display` (`dialog` or `band`), `autoSubmit` (default false), `language` (`en` default, `zh`, or `auto`), `minAnswerChars` (skip suggestions after shorter answers, default 80), `suggestSkills` (default true).

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
- 弹窗如果排在别的弹窗后面，等你作答时已经开始了新一轮，这个答案作废：不写入也不发送。

### 弹窗模式（默认，`display: dialog`）

回答结束后弹出问答框（以下用中文界面举例；默认是英文，见下方「界面语言」）：

- 列出最多三条建议，外加「暂不需要」（英文为 Not now）；每个选项的描述是它的完整提示，选之前就能看到全部文字。弹窗自带的「Other」可以自己输入。
- 选中一条：默认把完整提示作为草稿写入输入框，你可以编辑后自己按 Enter 发送。
- 打开 `autoSubmit` 后，选中即直接发送（弹窗标题变为「下一步·直接发送」，英文为 Next · send，以示区别）。
- 在「Other」里输入的文字同样处理；选「暂不需要」或关闭弹窗则什么都不做。
- 弹窗模式不在输入框上方画任何东西，生成建议期间也不显示加载提示。
- 注意：弹窗会占用键盘直到你作答或关闭；嫌打扰可以改用按钮行，或调高 `minAnswerChars`。

### 界面语言（`language`）

弹窗的问题、标题、关闭选项，以及按钮行的标题、关闭按钮和加载提示，都按 `language` 选项显示：

| 值 | 效果 |
| --- | --- |
| `en`（默认） | 英文：What next? / Next step / Not now |
| `zh` | 中文：接下来做什么？ / 下一步 / 暂不需要 |
| `auto` | 跟随你最近一条消息的语言：汉字数量达到拉丁字母的三分之一（且至少 2 个）就用中文，否则英文。中文消息里夹带的英文文件名、命令名不会让它误判成英文 |

建议本身的内容由模型按你的说话方式生成，不受这个选项影响。

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
- 建议以你的口吻写成，可能被当作你本人的话直接发送，所以每条只能是「要 Claude 做什么」的请求：生成时要求模型不得替你声称做过、看到过或确认过什么（如「我重启了」「测试通过了」），模型仍这样写的建议会被丢弃。这道过滤按常见说法匹配，无法覆盖所有措辞。
- 模型输出视为不可信文本：显示前会清除终端转义序列、控制字符、不可见字符等。

按钮行模式依赖输入框上方的区域，VS Code 扩展与手机 App 目前没有这块区域，因此不显示。

## 行为与数据披露

1. **发送提示（`autoSubmit`，默认关闭）**：关闭时插件只把草稿写进输入框，从不发送。打开后，只有你在弹窗里亲自选中某一条（选之前能看到完整文字），插件才发送；以你本人的话发送（`$.prompt.submit` 带 `asUser: true`，Claude 不会看到「由插件发送」的框架，但会话记录里仍标明来源是插件）。在「Other」里输入的文字同样处理。关闭弹窗不会发送任何东西：即使 Claude Code 把关闭报告成「[User dismissed …]」这类文字，插件也会识别并忽略。按钮行模式只显示短标签，所以从不发送。
2. **改变弹窗的绘制**：`ui.render`（`AskUserQuestion`）钩子只在本插件自己的弹窗（问题与标题对得上、且有一组建议在等待作答时）给选项补上描述（完整提示）。其他所有 AskUserQuestion 弹窗，包括 Claude 自己向你提的问题，都原样绘制。作答仍按标签匹配，只改显示。
3. **数据去向与成本**：生成建议时调用 `$.model.fork`，把会话自己的对话记录（按主线程上次发送的样子）加一条简短指令，通过 Claude Code 现有的模型连接再发一次。数据不会去到会话本来不发往的任何地方。每轮建议多一次不带工具的模型请求，通常命中提示缓存，计入你的用量。插件不在磁盘上存任何东西，也不跨会话保留记录。
4. **适用范围**：只在 Claude Code 中生效（终端，以及 Claude 桌面 App 的 Code tab）。它基于 Claude Code 的函数钩子插件接口，在 claude.ai 聊天和 Cowork 中不起作用。按钮行模式需要输入框上方的区域，VS Code 扩展与手机 App 目前没有。

## 选项

| 选项 | 默认值 | 作用 |
| --- | --- | --- |
| `display` | `dialog` | `dialog`：问答弹窗；`band`：输入框上方的按钮行 |
| `autoSubmit` | `false` | 仅弹窗模式：选中后直接发送，而不是写入输入框 |
| `language` | `en` | 界面语言：`en` 英文、`zh` 中文、`auto` 跟随你最近一条消息 |
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

测试覆盖：按钮行模式在终端与桌面两种界面的显示、点击与收起；弹窗模式的选项、选中、Other 输入与关闭；以及边界情况：短回答或中断的回合不给建议、模型输出非 JSON 或为空、超过三条截断、不存在的斜杠命令被丢弃、终端转义与控制字符清除、标签去重；弹窗选项的描述为完整提示、其他来源的弹窗不被改动；autoSubmit 打开时直接按本人的话发送、关闭时只写草稿；何时弹窗：只在你发起的回合之后，自动开启的回合、子代理回合、正在打字、弹窗已开、同一回合重复时都不弹；界面语言：默认英文、zh 中文、auto 按最近一条消息判断（含中英混合消息）、非法值回退英文，弹窗与按钮行在两种语言下的全部文字；建议不得替你声称：生成提示词的要求，以及中英文各类「我重启了 / 测试通过了 / I already tested it」被丢弃、正常请求保留。

## 许可

MIT。原作 © Thariq Shihipar，桌面适配 © SorcererAres。

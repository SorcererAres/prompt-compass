# next-steps-app

每轮对话结束后，在输入框上方给出最多三条「下一步」建议。**终端和 Claude 桌面 App 的 Code tab 都能用。**

基于 [anthropics/claude-plugins-community](https://github.com/anthropics/claude-plugins-community/tree/main/next-steps) 中 Thariq Shihipar 的 `next-steps` 插件改写。原版只在终端绘制，本版本按界面分支渲染，让桌面 App 也能显示。

## 安装

在 Claude Code 中：

```
/plugin marketplace add SorcererAres/next-steps-app
/plugin install next-steps-app@next-steps-app
```

或在命令行：

```bash
claude plugin marketplace add SorcererAres/next-steps-app
```

```bash
claude plugin install next-steps-app@next-steps-app
```

如果同时装了原版 `next-steps`，建议先停用它，避免终端里出现两份建议：

```bash
claude plugin disable next-steps@claude-community
```

安装后新开的会话自动生效。

## 效果

**桌面 App（Code tab）**：输入框上方出现一行「下一步：」，后面是可点击的原生按钮，第一条为主按钮；右侧是桌面自带的关闭控件。

**终端**：与原版一致：

```
next:
  1: run the tests you just wrote
  2: do the same for the settings page
  3: /code-review high
  0: dismiss
```

- 点击建议（或在空输入框 / 聚焦建议栏时按 `1`、`2`、`3`），该建议会作为草稿写入输入框，你可以编辑后自己按 Enter 发送。
- `0` 或关闭按钮：收起建议。
- 第一条建议同时作为输入框的灰色提示，按 `Tab` 直接采用。
- **插件从不自动发送任何提示。**

## 工作原理

函数钩子插件（`hooks/register.tsx`）：

- `turn.complete`：用 `$.model.fork` 分叉当前会话，请模型预测接下来最可能的提示。分叉共享会话的提示缓存，成本约等于一条简短回复。
- `$.command.list`：把会话中可用的 skill 与斜杠命令交给分叉，所以建议可以是 `/skill 参数`；不存在的命令会被丢弃。
- `ui.render`（`AbovePrompt`）：按 `e.surface` 分支绘制：终端为纯文本热键行，桌面为原生按钮行。
- 选中时调用 `$.prompt.fill`；第一条建议同时交给 `$.prompt.suggest`。
- `turn.start`：新一轮开始时隐藏建议。
- 模型输出视为不可信文本：显示前会清除终端转义序列、控制字符、不可见字符等。

VS Code 扩展与手机 App 目前不提供输入框上方的区域，因此不显示建议。

## 选项

| 选项 | 默认值 | 作用 |
| --- | --- | --- |
| `minAnswerChars` | `80` | 回答短于该字符数时不给建议 |
| `suggestSkills` | `true` | 是否把会话可用的 skill 与斜杠命令告诉建议生成器 |

修改：`/plugin configure next-steps-app@next-steps-app`

## 开发

```bash
claude plugin validate .
```

```bash
claude plugin test .
```

测试覆盖终端与桌面两种界面：显示建议、点击填入输入框、点击后收起。

## 许可

MIT。原作 © Thariq Shihipar，桌面适配 © SorcererAres。

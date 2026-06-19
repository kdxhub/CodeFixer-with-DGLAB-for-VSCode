# 架构文档 — CodeFixer-with-DGLAB-for-VSCode

本文由AI生成

## 目录

1. [整体架构总览](#1-整体架构总览)
2. [模块详解](#2-模块详解)
3. [事件驱动强度系统](#3-事件驱动强度系统)
4. [数据流全景](#4-数据流全景)
5. [如何开发新事件绑定](#5-如何开发新事件绑定)
6. [扩展指南](#6-扩展指南)

---

## 1. 整体架构总览

### 分层依赖图

```
                    ┌──────────────┐
                    │   entry.js   │  ← 依赖注入入口
                    └──────┬───────┘
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
   ┌────────────┐  ┌──────────────┐  ┌──────────────┐
   │ vscode-ui  │  │ vscode-events│  │websocket-    │
   │ (状态栏&    │  │ (诊断&终端   │  │server        │
   │  命令&二维码)│  │  事件处理)   │  │ (WS服务&定时器)│
   └─────┬──────┘  └──────┬───────┘  └──────┬───────┘
         │                │                  │
         ▼                ▼                  ▼
   ┌─────────────────────────────────────────────┐
   │            pulse-service                     │
   │   PowerManager(事件驱动强度) + PulseManager   │
   └────────────────┬────────────────────────────┘
                    │
                    ▼
   ┌─────────────────────────────────────────────┐
   │           config-manager                     │
   │         (VS Code 配置读取)                    │
   └─────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────┐
   │         connection-manager                   │
   │       (纯数据层: 客户端连接状态)               │
   └─────────────────────────────────────────────┘
```

### 核心原则

| 原则 | 说明 |
|------|------|
| **单向依赖** | 上层依赖下层，下层绝不依赖上层。箭头方向即依赖方向 |
| **依赖注入** | 所有模块通过构造函数接收依赖，不在内部 `require` |
| **回调解耦** | 网络层(WebSocket)通过回调通知 UI 层，不直接调用 vscode API |
| **纯数据层** | `connection-manager` 只管理 Map 状态，不处理 I/O |
| **事件驱动强度** | 所有强度贡献通过 `IntensityEvent` 叠加计算 |

### 文件结构

```
src/
├── entry.js                          # 入口：依赖注入、组装所有模块
├── config-manager/
│   └── index.js                      # VS Code 配置读取 + 本地 IP 检测
├── pulse-service/
│   ├── index.js                      # PowerManager(事件强度) + PulseManager(波形)
│   └── presets.js                    # 波形预设数据（纯数据）
├── connection-manager/
│   └── index.js                      # 客户端连接状态管理
├── websocket-server/
│   └── index.js                      # WebSocket 服务 + 心跳/脉冲定时器
├── vscode-events/
│   └── index.js                      # VSCode 诊断事件 + 终端事件处理
└── vscode-ui/
    └── index.js                      # 状态栏、命令注册、二维码生成
```

---

## 2. 模块详解

### 2.1 ConfigManager (`src/config-manager/index.js`)

**职责**：读取 VS Code `codefixer-with-dg-lab` 命名空间下的所有配置项。

**零依赖**：不依赖任何其他模块。

**关键 API**：

```js
const config = new ConfigManager();

// 代码纠错强度配置
config.codeInfo    // → { first, every, max }
config.codeWarn    // → { first, every, max }
config.codeError   // → { first, every, max }
config.codeMode    // → 'left' | 'right' | 'bothAll' | 'bothAvg'

// 终端配置
config.terminalRate       // 退出码倍率
config.terminalDuration   // 持续时间(ms)
config.terminalIrreversible // 是否可逆
config.terminalInterrupt  // 中断退出码
config.terminalTips       // 提示文本

// 服务器配置
config.serverPort              // WS 端口
config.serverOverrideIp        // 覆写 IP
config.serverQrSize            // 二维码尺寸
config.serverQrCorrectionLevel // 纠错等级

// 波形配置
config.pulseLeft
config.pulseRight

// 工具
config.getLocalIp()    // 获取本地 IPv4 地址
config.refresh()       // 刷新缓存（配置变更时调用）
```

### 2.2 ConnectionManager (`src/connection-manager/index.js`)

**职责**：管理 WebSocket 客户端连接状态，纯数据层，不做任何 I/O。

**关键 API**：

```js
const cm = new ConnectionManager(serverId);

cm.serverId         // 插件固定 ID
cm.totalCount       // 所有客户端数（含未绑定）
cm.boundCount       // 已绑定 APP 数
cm.hasAny           // 是否有任何客户端
cm.hasBound         // 是否有已绑定客户端

cm.add(id, ws)              // 添加连接
cm.bind(appId, ws)          // 绑定 APP
cm.removeByWs(ws)           // 移除连接 → clientId
cm.findClientIdByWs(ws)     // 通过 ws 找 clientId
cm.clear()                  // 清空所有

cm.broadcastAll((clientId, ws) => { ... })    // 广播给所有
cm.broadcastBound((appId, ws) => { ... })     // 广播给已绑定
```

### 2.3 PowerManager (`src/pulse-service/index.js`)

**职责**：强度管理器，是整个插件的核心。采用**事件驱动**机制管理所有强度贡献。详见[第 3 章](#3-事件驱动强度系统)。

### 2.4 PulseManager (`src/pulse-service/index.js`)

**职责**：波形预设数据获取。

```js
const pm = new PulseManager();
pm.getPulseData('潮汐', '心跳节奏')
// → ['["0A0A0A0A00000000", ...]', '["0A0A0A0A00000000", ...]']
```

### 2.5 WebSocketServer (`src/websocket-server/index.js`)

**职责**：WebSocket 服务生命周期、心跳(60s)、波形下发(1s)、消息路由。

**不直接依赖 vscode API**，通过回调与 UI 层通信。

**回调钩子**：

| 回调 | 触发时机 |
|------|----------|
| `onStatusChange(cb)` | 服务器状态变化时 |
| `onShowConnect(cb)` | 需要显示连接二维码时 |
| `onInfo(cb)` | 需要显示 info 消息时 |
| `onWarn(cb)` | 需要显示 warning 消息时 |
| `onError(cb)` | 需要显示 error 消息时 |
| `onConfirm(cb)` | 需要用户确认（启动警告）时 |

**关键 API**：

```js
wsServer.startServer()                        // 启动（带确认对话框）
wsServer.stopServer()                         // 停止
wsServer.switchMode()                         // 状态切换
wsServer.forcePause(reason)                   // 强制暂停
wsServer.getStatus()                          // 获取状态
wsServer.distributePunishment()               // 下发强度
```

**消息路由**：

```
收到的 WebSocket 消息
├── type === 'bind'
│   └── message === 'DGLAB' → 绑定 APP
├── type === 'msg', message.startsWith('feedback-')
│   └── 强制暂停
├── type === 'msg', message.startsWith('strength-')
│   └── 更新 APP 强度事件 + 硬上限
└── 其他 → 忽略
```

### 2.6 VscodeEventHandler (`src/vscode-events/index.js`)

**职责**：监听 VSCode 原生事件，通过 PowerManager 的事件 API 创建/更新强度事件。

**关键 API**：

```js
const handler = new VscodeEventHandler(powerManager, configManager);

handler.onUpdate(cb)              // 注册 UI 更新回调
handler.processDiagnostics()      // 处理诊断变化
handler.processTerminalExecution(event)  // 处理终端执行
handler.registerListeners(context)       // 注册 VSCode 监听器
```

### 2.7 StatusBarManager (`src/vscode-ui/index.js`)

**职责**：状态栏显示、命令注册、二维码生成。

**依赖**：WebSocketServer, ConnectionManager, PowerManager, ConfigManager

**命令列表**：

| 命令 | 功能 |
|------|------|
| `dglab.open_config` | 打开插件设置 |
| `dglab.server.start` | 启动 WebSocket 服务 |
| `dglab.server.stop` | 停止 WebSocket 服务 |
| `dglab.server.pause` | 切换暂停/恢复 |
| `dglab.server.pause.forced` | 紧急暂停（快捷键） |
| `dglab.detail` | 切换工作状态 |
| `dglab.update` | 强制刷新状态栏 |

### 2.8 Entry (`src/entry.js`)

**职责**：纯组装，创建所有实例并通过构造函数注入依赖，不包含业务逻辑。

```js
// 伪代码——真实实现在 entry.js
function activate(context) {
  // 1. 创建所有管理器
  const configManager   = new ConfigManager()
  const powerManager    = new PowerManager()
  const pulseManager    = new PulseManager()
  const connectionMgr   = new ConnectionManager(SERVER_ID)
  const wsServer        = new WebSocketServer(connectionMgr, powerManager, pulseManager, configManager)
  const eventHandler    = new VscodeEventHandler(powerManager, configManager)
  const uiManager       = new StatusBarManager(wsServer, connectionMgr, powerManager, configManager)

  // 2. 连接事件 → UI
  eventHandler.onUpdate(() => uiManager.update())

  // 3. 监听配置变更
  vscode.workspace.onDidChangeConfiguration(...)

  // 4. 激活 UI + 注册事件监听
  uiManager.activate(context)
  eventHandler.registerListeners(context)
}
```

---

## 3. 事件驱动强度系统

这是整个插件的核心机制。所有强度贡献都通过 `IntensityEvent` 管理，最终强度由事件叠加计算得出。

### 3.1 IntensityEvent 类

```js
class IntensityEvent {
  constructor({ id, channel, value, category, label, duration })

  // ── 字段 ──
  id: string            // 全局唯一标识，如 '_code_left', '_term_left_1718000000_a1b2'
  channel: string       // 'left' | 'right' | 'both'
  value: number         // 当前强度值（可读写）
  category: string      // 'persistent' | 'temporary'
  label: string         // 人类可读标签
  createdAt: number     // 创建时间戳
  expiresAt: number|null // 过期时间戳（persistent 为 null）
  _timer: Timer|null    // 自动清理定时器（内部）

  // ── 只读属性 ──
  event.expired         // true = 已过期
  event.isTemporary     // true = 临时事件
}
```

### 3.2 两种事件类型

```
IntensityEvent
├── persistent（长期有效）
│   ├── 不过期，永久存在于事件 Map 中
│   ├── 通过 updateEvent(id, value) 修改值
│   ├── 通过 removeEvent(id) 手动移除
│   └── 用途：代码纠错强度、APP 设置强度
│
└── temporary（临时叠加）
    ├── 创建时指定 duration(ms)
    ├── expiresAt 到达后自动从 Map 中移除
    ├── 自动清理内部的 setTimeout 定时器
    ├── 支持 onExpire 回调
    └── 用途：终端退出码强度
```

### 3.3 PowerManager 事件 API

```js
// ── 管理事件 ──
pm.addEvent({ id, channel, value, category, duration, label, onExpire })
pm.removeEvent(id)              // 移除事件（清理 timer）
pm.updateEvent(id, value)       // 更新 persistent 事件的值
pm.getEvent(id)                 // 获取事件引用
pm.hasEvent(id)                 // 检查是否存在
pm.getAllEvents()               // 获取所有事件的 JSON 快照
pm.clearAllEvents()             // 清空（清理所有 timer）

// ── 计算最终强度 ──
pm.getLeft()                    // 左通道：叠加 → clamp
pm.getRight()                   // 右通道：叠加 → clamp

// ── 生命周期 ──
pm.pause() / pm.resume() / pm.togglePause()
pm.reset()                      // 清空事件 + 重置 hardLimit

// ── 硬上限 ──
pm.hardLimit                    // 绝对上限，getLeft/getRight 不会超过此值
```

### 3.4 强度叠加算法

```js
// PowerManager._calcChannel(channel) 的核心逻辑：
//
// 1. 先清理所有已过期的事件（防止残留）
// 2. 遍历所有事件，筛选匹配通道的（channel === 'left'/'right'/'both'）
// 3. 对 value 求和
// 4. clamp(sum, 0, hardLimit)

最终强度 = Math.min(Math.max(Math.floor(Σ值), 0), hardLimit)
```

### 3.5 内置事件清单

| 事件 ID | 通道 | 类型 | 来源 | 更新方式 |
|---------|------|------|------|----------|
| `_code_left` | left | persistent | 代码纠错 | `processDiagnostics()` 每次重新计算 |
| `_code_right` | right | persistent | 代码纠错 | 同上 |
| `_app_left` | left | persistent | APP 端设置 | APP 反馈 `strength-` 消息 |
| `_app_right` | right | persistent | APP 端设置 | 同上 |
| `_term_left_<ts>_<rand>` | left | temporary | 终端执行 | 每次执行新增一个 |
| `_term_right_<ts>_<rand>` | right | temporary | 终端执行 | 每次执行新增一个 |

### 3.6 向后兼容

旧的 `setLeft(index, value)` / `leftValues[index]` API 仍然可用，内部映射到事件系统：

```js
setLeft(0, val)  → _code_left  persistent 事件
setLeft(1, val)  → _term_left  temporary 事件（旧版覆盖模式）
setLeft(2, val)  → _app_left   persistent 事件
```

---

## 4. 数据流全景

### 4.1 诊断触发流程

```
VS Code 诊断变化
       │
       ▼
VscodeEventHandler.processDiagnostics()
       │ 统计 errors/warnings/infos
       │ 根据配置计算 strength
       │ 根据 codeMode 分配左右
       ▼
PowerManager.updateEvent('_code_left', value)
PowerManager.updateEvent('_code_right', value)
       │
       ▼
回调 → StatusBarManager.update()
       │ 读取 getLeft() / getRight()
       │ 更新状态栏文本
       ▼
WebSocketServer.distributePunishment()
       │ 读取 getLeft() / getRight()
       │ 发送 strength-1+2+{left} / strength-2+2+{right}
       ▼
DG-LAB APP 执行强度
```

### 4.2 终端执行触发流程

```
VS Code 终端执行结束
       │
       ▼
VscodeEventHandler.processTerminalExecution(event)
       │ exitCode × rate = strength
       │ 生成唯一 ID: _term_left_{timestamp}_{rand}
       ▼
PowerManager.addEvent({
  id: '_term_left_1718000000_a1b2',
  channel: 'left',
  value: strength,
  category: 'temporary',
  duration: config.terminalDuration,
})
       │ ← 自动设定 setTimeout(duration)
       │
       ├──→ 立即: 回调 → UI 更新 → 强度下发
       │
       └──→ duration 后: 自动移除事件 → 回调 → UI 更新 → 强度归零
```

### 4.3 APP 反馈处理流

```
DG-LAB APP 发送 strength- 消息
       │
       ▼
WebSocketServer._handleMessage()
       │ 解析 strength-{curA}+{curB}+{maxA}+{maxB}
       │ 更新 PowerManager.hardLimit
       │ 计算差值，更新 _app_left / _app_right 事件
       ▼
回调 → StatusBarManager.update()
       ▼
distributePunishment()
```

### 4.4 暂停状态

```
暂停时: PowerManager.paused = true
       │
       ▼
getLeft() / getRight() → 直接返回 0
       │
       ▼
distributePunishment() → 强度 0 下发
波形定时器 → 只清除不清除（paused 时跳过 pulse）
```

---

## 5. 如何开发新事件绑定

以下示例演示如何添加一个新的强度事件源。假设我们要为"文件保存操作"增加强度事件。

### 5.1 简单实现：在 VscodeEventHandler 中添加

```js
// src/vscode-events/index.js

class VscodeEventHandler {
  // ...

  /**
   * 处理文件保存事件
   * 每次保存创建一个 2 秒的临时强度
   */
  processFileSave(uri) {
    const strength = 10; // 保存一次 = 10 强度
    const duration = 2000; // 2 秒后自动消失

    const timestamp = Date.now();
    const rand = Math.random().toString(36).slice(2, 6);

    this._pm.addEvent({
      id: `_save_left_${timestamp}_${rand}`,
      channel: 'left',
      value: strength,
      category: 'temporary',
      label: '文件保存',
      duration,
    });

    this._pm.addEvent({
      id: `_save_right_${timestamp}_${rand}`,
      channel: 'right',
      value: strength,
      category: 'temporary',
      label: '文件保存',
      duration,
    });

    console.log('文件保存强度事件已添加');
    this._notifyUpdate();
  }

  /**
   * 注册监听器时加入文件保存
   */
  registerListeners(context) {
    // ... 已有的诊断和终端监听 ...

    // 新增：文件保存监听
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        this.processFileSave(doc.uri);
      })
    );
  }
}
```

### 5.2 复杂实现：自定义长期事件（恒温模式）

创建一个长期事件，每隔 30 秒在左右交替强度：

```js
class VscodeEventHandler {
  // ...

  /** 恒温模式定时器 */
  startAlternatingMode() {
    const id = '_custom_alternating';
    let isLeft = true;

    // 先创建事件（初始值 0）
    this._pm.addEvent({
      id: `${id}_left`,
      channel: 'left',
      value: 0,
      category: 'persistent',
      label: '恒温模式',
    });
    this._pm.addEvent({
      id: `${id}_right`,
      channel: 'right',
      value: 0,
      category: 'persistent',
      label: '恒温模式',
    });

    // 每隔 5 秒切换一次值
    this._alternateTimer = setInterval(() => {
      const value = isLeft ? 30 : 20;
      this._pm.updateEvent(`${id}_left`, isLeft ? value : 0);
      this._pm.updateEvent(`${id}_right`, isLeft ? 0 : value);
      isLeft = !isLeft;
      this._notifyUpdate();
    }, 5000);
  }

  stopAlternatingMode() {
    if (this._alternateTimer) {
      clearInterval(this._alternateTimer);
      this._alternateTimer = null;
    }
    this._pm.removeEvent('_custom_alternating_left');
    this._pm.removeEvent('_custom_alternating_right');
  }
}
```

### 5.3 事件命名规范

为了保证清晰可维护，新事件请遵循以下命名规范：

| 事件类型 | 命名格式 | 示例 |
|----------|----------|------|
| 内置 persistent | `_{source}_{channel}` | `_code_left`, `_app_right` |
| 自定义 persistent | `_custom_{name}_{channel}` | `_custom_alternating_left` |
| 内置 temporary | `_{source}_{channel}_{ts}_{rand}` | `_term_left_1718000000_a1b2` |
| 自定义 temporary | `_custom_{name}_{channel}_{ts}_{rand}` | `_custom_save_left_1718000000_a1b2` |

### 5.4 事件生命周期管理要点

| 要点 | 说明 |
|------|------|
| **ID 唯一性** | 同一 ID 重复 `addEvent` 会更新值而非创建新事件 |
| **persistent 清理** | persistent 事件不会自动移除；不再需要时须手动 `removeEvent` |
| **temporary 清理** | temporary 事件到期自动移除，无需手动清理 |
| **reset 时的清理** | `PowerManager.reset()` 会清空所有事件和定时器 |
| **getLeft 中的清理** | 每次计算强度时会顺带清理过期事件 |

### 5.5 通道选择指南

```js
channel: 'left'   // 仅影响左通道
channel: 'right'  // 仅影响右通道
channel: 'both'   // 同时影响左右通道
```

### 5.6 调试技巧

```js
// 在 console 中查看所有事件
pm.getAllEvents()
// → [{ id, channel, value, category, label, createdAt, expiresAt }, ...]

// 查看最终强度
pm.getLeft()   // 左通道最终值
pm.getRight()  // 右通道最终值
```

---

## 6. 扩展指南

### 6.1 添加新的命令

在 `vscode-ui/index.js` 的 `activate()` 方法中注册：

```js
// 1. 注册命令
const commands = {
  // ... 已有命令 ...
  'dglab.my_new_command': () => {
    // 你的逻辑
  },
};

// 2. 在 package.json 中添加声明
// "contributes.commands": [{ "command": "dglab.my_new_command", "title": "..." }]
// "contributes.keybindings": [{ "command": "dglab.my_new_command", "key": "..." }]
```

### 6.2 添加新的配置项

```js
// 1. 在 config-manager/index.js 中添加 getter
get myNewSetting() {
  return this._cache.get('myNewSetting');
}

// 2. 在 package.json contributes.configuration 中添加定义
// "codefixer-with-dg-lab.myNewSetting": { "type": "number", "default": 42 }
```

### 6.3 添加新的 WebSocket 消息处理

在 `websocket-server/index.js` 的 `_handleMessage()` 方法中添加分支：

```js
// 处理自定义消息
if (data.type === 'msg' && data.message.startsWith('custom-')) {
  // 你的逻辑
  // 可以通过 this._pm 操作强度事件
  // 可以通过回调通知 UI
  return;
}
```

### 6.4 添加新的 UI 元素

```js
// 在 vscode-ui/index.js 的 StatusBarManager 中添加
class StatusBarManager {
  // ...
  addMyWidget() {
    const myItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right, 100
    );
    myItem.text = '$(heart) 我的组件';
    myItem.show();
    this._context.subscriptions.push(myItem);
  }
}
```

---

> 架构设计原则：**Keep it simple, make it extendable.**
> 每添加一个新功能前，先思考它属于哪个层级：是新的强度源（pulse-service）、
> 新的事件源（vscode-events）、新的 UI 交互（vscode-ui），还是新的协议消息（websocket-server）。

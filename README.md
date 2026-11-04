
# DeepSeek Builder

> 用一句自然语言，在 Minecraft 里生成建筑。  
> 基于 **LiteLoaderBDS** 的 AI 建筑生成插件，对接 **DeepSeek** 大模型，支持选区、生成、历史记录与重放。

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Levilamina-green.svg)
![Version](https://img.shields.io/badge/version-1.0.3-orange.svg)

---

## ✨ 功能特性

- 🧱 **自然语言建建筑**：在选区里描述需求（例如"建一个两层小木屋"），AI 自动生成方块填充指令
- 🪓 **铁斧两点选区**：手持铁斧左右键点击两个方块即可确定建筑范围
- ⚡ **分块填充**：自动把大范围按 16×16 分块，逐块 `fill`，规避单条指令体积限制
- 📊 **指令队列调度**：BossBar 实时显示进度，逐条执行，完成后自动传送回原位
- 🕘 **历史记录**：保存每次对话，可查看详情、一键重新执行、清空记录
- 🔁 **结构 save / load**：支持把选区保存为结构并复用加载
- 🧩 **台阶智能命名**：自动把 `xxx_slab_bottom / _top` 转成 `vertical_half` 方块状态

---

## 🏗 工作原理

```
玩家描述 ──► Python 调用 DeepSeek API ──► 返回紧凑标签文本
                                              │
                                              ▼
                    Task(相对坐标) ──► Builder(世界坐标) ──► CommandQueue(逐条执行)
```

- **Task**：记录选区最小点、尺寸、维度，把 AI 的**局部坐标**转换成世界坐标
- **Builder**：生成具体的 `fill / save / load` 指令数组
- **CommandQueue**：按 50ms 间隔逐条执行，BossBar 显示进度

---

## 📦 环境要求

| 依赖 | 说明 |
|:---|:---|
| [lse](https://github.com/LiteLDev/legacyscriptengine) | 插件运行平台 |
| Python 3.8+ | 调用 DeepSeek API |
| `openai` Python 包 | `pip install openai` |
| DeepSeek API Key | 在 [DeepSeek 开放平台](https://platform.deepseek.com/) 申请 |

---

## 🚀 安装

1. 将两个文件放入服务器目录：

```
服务器根目录/
├── plugins/
│   └── deepseekbuilder/
│       ├── deepseekbuilder.js
│       └── deepseekbuilder.py
└── deepseekbuilder.json      ← 首次运行自动生成（对话历史）
```

2. 安装 Python 依赖：

```bash
pip install openai
```

3. 编辑 `deepseekbuilder.py`，填入你的 API Key：

```python
DEEPSEEK_API_KEY = "sk-xxxxxxxxxxxxxxxx"
```

4. 重启服务器，控制台看到插件加载即成功。

---

## 🎮 使用方法

### 1. 选区

手持 **铁斧**，左键点击方块 A，再左键点击方块 B（或右键，取决于客户端行为），聊天栏会提示选区大小。

> 两次点击需间隔 500ms 以上，防止重复触发。再次点击会重置选区。

### 2. 生成建筑

```
/dsb generate
```

弹出表单，输入建筑描述，例如：

> 在选区内建一个带尖顶的中世纪石屋，开一扇门和两扇窗

AI 生成后会提交到执行队列，BossBar 显示进度，完成后传送回原位。

### 3. 直接执行标签

```
/dsb do "<fill>0,0,0,8,0,8,minecraft:stone</fill>"
```

跳过 AI，直接解析并执行你给的标签内容（适合调试或复用历史结果）。

### 4. 查看历史记录

```
/dsb history
```

- 点击 **🗑 清空历史对话** 删除该玩家全部记录
- 点击某条记录查看 AI 原始回复
- 最新一条记录底部有 **🔄 重新执行** 开关，勾选后会用当前选区重新跑一遍

---

## 📖 指令一览

| 指令 | 说明 |
|:---|:---|
| `/dsb generate` | 打开需求表单，调用 AI 生成建筑 |
| `/dsb do "<content>"` | 直接执行标签内容 |
| `/dsb history` | 查看 / 清空历史记录 |
| `/dsb` | 别名，等同于 `deepseekbuilder` |

**权限**：`GameMasters`（OP 及以上），`permLevel == 0` 的玩家无法使用。

---

## 🧾 AI 输出格式（开发者参考）

AI 只输出 API 调用序列，无解释文字，多个调用紧凑相连：

```xml
<fill>x0,y0,z0,x1,y1,z1,blockid</fill>
<save>x0,y0,z0,x1,y1,z1,name</save>
<load>x,y,z,name</load>
```

- 坐标均为**相对选区最小点**的局部坐标，范围 `0 ~ len-1`
- 用户请求会带上 `<limit>x,y,z</limit>` 前缀，约束生成范围
- 台阶必须写 `minecraft:oak_slab_bottom` / `_top`，插件会自动转换

---

## ⚠️ 注意事项

- **先在测试世界或备份后使用**：AI 生成结果不保证美观与结构合理，且会直接改动世界方块
- 执行期间玩家会被临时传送到各区块位置，**请勿在危险环境（岩浆、虚空边）中使用**
- 建议建筑尺寸不超过 **64×64×64**，过大区域会产生大量指令、执行时间较长
- 模型名在 `deepseekbuilder.py` 中为 `deepseek-v4-pro` / `deepseek-v4-flash`，如官方模型名变更请自行修改
- 历史记录会持续累积，长期使用建议定期清理 `deepseekbuilder.json`
- 若报错 `请先在 deepseek.py 中填入你的 DEEPSEEK_API_KEY`，请检查 Key 是否与脚本中的默认占位符一致（脚本默认值为 `"to replace"`）

---

## 🐛 常见问题

**Q：提示"请先用铁斧选区"？**  
A：需要手持铁斧依次点击两个方块，看到 `POS_A` / `POS_B` 提示后再执行指令。

**Q：执行后建筑位置不对？**  
A：AI 坐标是相对选区的，选区最小点即局部 `(0,0,0)`。请确认两次点击的方块范围符合预期。

**Q：生成失败退出码非 0？**  
A：查看服务器控制台的 `[DSB] 错误输出`，通常是 API Key 无效、网络不通或 Python 环境缺少 `openai`。

**Q：台阶变成整块？**  
A：确认 AI 输出的是 `_bottom` / `_top` 后缀格式，插件依赖该后缀转换为 `vertical_half` 状态。

---

## 📄 License

MIT License

---

## 🙏 致谢

- [DeepSeek](https://www.deepseek.com/) —— 大模型能力
- [LiteLoaderBDS](https://github.com/LiteLDev/LiteLoaderBDS) —— 插件平台
- [HelperLib](https://github.com/afraidofsunlight/HelperLib) —— 类型支持

> 本项目仅供学习交流，请遵守 DeepSeek 服务条款与 Minecraft 相关协议。

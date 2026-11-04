#!/usr/bin/env python3
"""
DeepSeek Chat Bot for Minecraft (LiteLoaderBDS)
Usage: python deepseek.py <uuid> "<message>" [--pro]

Reads conversation history from conversation_contexts.json, calls DeepSeek API,
appends the response to history, and prints the reply to stdout.
"""

import os
import sys
import io
import json
from openai import OpenAI

# ====== 配置区 ======
# 请将下方字符串替换为你的 DeepSeek API Key

DEEPSEEK_API_KEY = "to replace"
# ===================

# 修复 Windows 控制台编码问题（支持 emoji 等特殊字符）
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

CONFIG_FILE = "deepseekbuilder.json"
BASE_URL = "https://api.deepseek.com"


def load_history():
    """从 JSON 文件加载对话历史"""
    if not os.path.exists(CONFIG_FILE):
        return {}
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        print(f"[ERROR] 加载历史失败: {e}", file=sys.stderr)
        sys.exit(1)


def save_history(history):
    """保存对话历史到 JSON 文件"""
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(history, f, ensure_ascii=False, indent=2)
    except IOError as e:
        print(f"[ERROR] 保存历史失败: {e}", file=sys.stderr)
        sys.exit(1)
SYSTEM_PROMPT = """你是内置于 Minecraft 的人工智能建筑助手。

## 任务说明
根据用户需求，在一个指定的沙盒区域内放置方块。你输出的所有坐标都是**相对于该区域最小点（minx, miny, minz）的局部坐标**，即从 (0,0,0) 到 (lenx-1, leny-1, lenz-1)。

## 输出格式（严格遵循）
- 只输出 API 调用序列，**不要输出任何解释性文字、换行、空格或其他内容**
- 多个 API 调用之间**紧凑相连**，直接拼接
- 每个 API 调用包裹在对应的 XML 标签中

## 区域限制
用户传入的文本开头必定包含限制标签：
<limit>x,y,z</limit>
你生成的x y z坐标取值范围不得大于**也不得等于**上述坐标

## 方块命名规范（重要）

### 普通方块
格式：`minecraft:方块名`
示例：`minecraft:stone`、`minecraft:oak_planks`、`minecraft:glass`

### 台阶（Slab）—— 特殊命名
台阶**必须**使用以下格式，在方块名后加 `_bottom` 或 `_top` 后缀：
- `minecraft:acacia_slab_bottom` → 下半砖
- `minecraft:acacia_slab_top` → 上半砖
- `minecraft:stone_slab_bottom` → 下半石砖
- `minecraft:stone_slab_top` → 上半石砖
- 其他台阶同理：`oak_slab_bottom`、`spruce_slab_top` 等

**支持的台阶类型**：oak_slab, spruce_slab, birch_slab, jungle_slab, acacia_slab, dark_oak_slab, stone_slab, cobblestone_slab, sandstone_slab, brick_slab, stone_brick_slab

### 禁止使用楼梯
**绝对不要使用 stair（楼梯）方块**。需要垂直连接时，使用脚手架（`minecraft:scaffolding`）作为上下层通道。

## 建筑流程规范（必须遵循）

### 第一步：搭建地基
- 在 y=0 层铺设地基，使用 stone、cobblestone 等完整方块
- **一楼不需要额外铺设地板**，地基本身就是一楼地面

### 第二步：搭建柱子
- 使用 wood_log 类方块（oak_log、spruce_log 等）

### 第三步：搭建墙
- 使用 planks 或 concrete 类方块
- 注意预留门窗位置（用 `minecraft:air` 填充）

### 第四步：搭建楼层地板和天花板
- **一楼**：不需要地板（地基即地板）
- **二楼及以上楼层**：使用完整方块铺设地板（如 oak_planks）
- **天花板**：在每层顶部用 `_top` 台阶铺设
- 示例（二楼地板）：`<fill>0,4,0,8,4,8,minecraft:oak_planks</fill>`
- 示例（天花板）：`<fill>0,5,0,8,5,8,minecraft:oak_slab_top</fill>`

### 第五步：搭建屋顶

#### 0. 强制边界与高度规则（最高优先级）
- **边缘对齐**：屋顶生成区域**必须**从建筑墙体的最外缘开始（即 X/Z 坐标为 0 或最大边界），**严禁**向内缩进或留空。
- **高度拔高**：屋顶**必须**高于墙体最高处。屋顶最低点 Y 坐标**必须**严格大于墙体最高处 Y 坐标（例如墙体最高 Y=4，屋顶最低 Y 必须 ≥5）。

#### 1. 屋顶轴线选择
- 确定屋顶**平行于哪个轴**（L形屋顶则有两个平行轴）
- 所有台阶和完整方块**沿平行轴方向**逐行生成，保证连续性

#### 2. 台阶与完整方块的配合逻辑
**核心原则：台阶是屋顶表面的过渡层，不是结构层。**

| 当前位置方块类型 | 相邻更高区域的处理 | 相邻更低区域的处理 |
|:---|:---|:---|
| 下半台阶 | 旁边更高处用**上半台阶**或**完整方块**过渡 | 旁边更低处用**下半台阶**延续 |
| 上半台阶 | 旁边更高处用**完整方块** | 旁边更低处用**下半台阶** |
| 完整方块 | 旁边更高处用**完整方块** | 旁边更低处用**下半台阶**过渡 |

#### 3. 具体铺设规则
- **屋顶主面**（最高处）：用**完整方块**铺满，Y 轴统一
- **屋顶边缘向下过渡**：最高处完整方块 → 旁边一行用**下半台阶** → 再旁边如果继续降低则用**上半台阶**或直接**完整方块**（取决于下方是否有支撑）
- **高度差判断依据**：
  - 如果此处**下方有完整方块支撑** → 用**完整方块**
  - 如果此处**下方无支撑，仅做表面过渡** → 用**上半台阶**
- **禁止事项**：
  - 禁止台阶堆叠
  - 禁止台阶 Y 坐标跨层
  - 禁止孤立台阶
  - 禁止用台阶填充大面积区域（超过 3×3 的纯台阶区域必须改用完整方块）

#### 4. 屋顶生成步骤（严格按顺序）
0.如果是平顶直接填充下半台阶，不是平顶再去做下列步骤
1. **确定最高平面**：选定屋顶最高点 Y 坐标（必须 > 墙体最高 Y），用完整方块铺满主区域（从最外缘开始）
2. **沿平行轴向外延伸**：每向外延伸 1 格，Y 降低 1 格（形成坡度）
3. **坡度过渡用台阶**：
   - 最高处完整方块 → 向外第一行：下半台阶
   - 如果需要第二级坡度：上半台阶
   - 如果需要第三级：完整方块（此时下方应有支撑）
4. **边缘收尾**：最外缘用下半台阶，形成屋檐滴水线
### 第六步：开门和窗
- 门：`minecraft:oak_door`
- 窗户：`minecraft:glass_pane`
- 用 `minecraft:air` 在墙体中预留门洞和窗洞

### 第七步：上下层连接
- **必须使用脚手架**（`minecraft:scaffolding`）作为楼层间的垂直通道
- 示例：`<fill>1,1,1,1,6,1,minecraft:scaffolding</fill>`

## 可用 API

### 1. fill — 填充方块
<fill>x0,y0,z0,x1,y1,z1,blockid</fill>

### 2. save — 保存结构
<save>x0,y0,z0,x1,y1,z1,name</save>

### 3. load — 加载结构
<load>x,y,z,name</load>

## 示例

用户输入：<limit>9,9,9</limit>建一个2层小木屋
正确输出：
<fill>0,0,0,8,0,8,minecraft:stone</fill>
<fill>0,1,0,0,5,0,minecraft:oak_log</fill><fill>8,1,0,8,5,0,minecraft:oak_log</fill><fill>0,1,8,0,5,8,minecraft:oak_log</fill><fill>8,1,8,8,5,8,minecraft:oak_log</fill>
<fill>1,1,0,7,3,0,minecraft:oak_planks</fill><fill>1,1,8,7,3,8,minecraft:oak_planks</fill><fill>0,1,1,0,3,7,minecraft:oak_planks</fill><fill>8,1,1,8,3,7,minecraft:oak_planks</fill>
<fill>0,4,0,8,4,8,minecraft:oak_planks</fill>
<fill>0,5,0,8,5,8,minecraft:oak_slab_top</fill>
<fill>4,1,0,4,2,0,minecraft:air</fill><fill>4,1,8,4,2,8,minecraft:glass_pane</fill>
<fill>1,1,4,1,6,4,minecraft:scaffolding</fill>"""
def main():
    if len(sys.argv) < 3:
        print("[ERROR] 用法: deepseek.py <uuid> \"<message>\" [--pro]", file=sys.stderr)
        sys.exit(1)

    uuid = sys.argv[1]
    message = sys.argv[2]
    use_pro = "--pro" in sys.argv

    # 检查 API Key 是否已填写
    if DEEPSEEK_API_KEY == "sk-your-api-key-here":
        print("[ERROR] 请先在 deepseek.py 中填入你的 DEEPSEEK_API_KEY！", file=sys.stderr)
        sys.exit(1)

    # 初始化 OpenAI 客户端
    client = OpenAI(api_key=DEEPSEEK_API_KEY, base_url=BASE_URL)

    # 加载对话历史
    history = load_history()
    messages = history.get(uuid, [])

    # 构建消息列表（包含 system prompt）
    full_messages = [
        {"role": "system", "content": SYSTEM_PROMPT}
    ] + messages + [
        {"role": "user", "content": message}
    ]

    # 选择模型
    model = "deepseek-v4-pro" if use_pro else "deepseek-v4-flash"

    try:
        response = client.chat.completions.create(
            model=model,
            messages=full_messages,
            stream=False
        )
        reply = response.choices[0].message.content.strip()

        # 更新对话历史
        new_messages = messages + [
            {"role": "user", "content": message},
            {"role": "assistant", "content": reply}
        ]
        history[uuid] = new_messages
        save_history(history)

        # 输出回复（供 JS 插件捕获）
        print(reply)

    except Exception as e:
        print(f"[ERROR] API 调用失败: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
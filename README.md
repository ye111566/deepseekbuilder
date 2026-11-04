# deepseekbuilder
use deepseek to build construstions in minecraft!(levilamina)
使用方法 (Usage)
1. 环境要求
LeviLamina​ 服务端（基岩版专用服务器）
安装 LegacyScriptEngine (LSE)，并确保已通过 lip 安装 QuickJS​ 与 Python​ 引擎
Python 3.10+（需与 LSE Python 引擎要求的版本匹配）
安装 Python 依赖库 openai
一个有效的 DeepSeek API Key
# 通过 lip 安装 LSE 引擎（示例）
lip install github.com/LiteLDev/LegacyScriptEngine#quickjs
lip install github.com/LiteLDev/LegacyScriptEngine#python

# 安装 Python 依赖
pip install openai
2. 安装插件
将插件文件夹整体放入服务端的 plugins/ 目录下：
plugins/
└── deepseekbuilder/
    ├── deepseekbuilder.js      # 主插件脚本
    ├── deepseekbuilder.py      # DeepSeek API 调用脚本
    └── manifest.json           # 首次启动后自动生成
放置完成后，重启服务端，LSE 会自动迁移并加载插件。
3. 配置 DeepSeek API Key
用文本编辑器打开 deepseekbuilder.py，找到以下配置项并填入你的 API Key：
DEEPSEEK_API_KEY = "sk-your-real-deepseek-key"
⚠️ 警告：请勿将包含真实 Key 的代码提交到公开仓库！
API Key 获取地址：https://platform.deepseek.com
4. 游戏内选区
手持 铁斧 (Iron Axe)
对着第一个方块右键单击​ → 设置 POS_A
对着对角方块右键单击​ → 设置 POS_B
插件会自动在聊天栏显示选区大小。如果已选好两点，再次右键会重置选区。
5. 指令说明
基础指令：/deepseekbuilder
快捷别名：/dsb
5.1 用自然语言生成建筑
/dsb generate
执行后会弹出表单：
在输入框中描述你的需求，例如：
在选区内生成一个带窗户和门的两层中世纪小木屋
插件会调用 DeepSeek AI 生成建筑方案
生成完毕后，方块会通过指令队列自动搭建
5.2 直接执行构建标签
/dsb do "<fill>0,0,0,8,0,8,minecraft:stone</fill>"
支持以下三种 XML 风格标签（紧凑相连，无空格）：
<fill>x0,y0,z0,x1,y1,z1,blockid</fill>
<save>x0,y0,z0,x1,y1,z1,name</save>
<load>x,y,z,name</load>
📌 所有坐标均为相对于选区最小点 (minx, miny, minz) 的局部坐标。
5.3 查看与重新执行历史记录
/dsb history
浏览你过去的 AI 对话与生成结果
查看 AI 输出的原始标签
最新一条记录支持一键重新执行（需提前用铁斧重新选区）
6. AI 建筑规则简介
AI 在生成建筑时遵循以下硬性规则（由系统提示词约束）：
坐标为局部坐标，范围从 (0,0,0) 到 (lenX-1, lenY-1, lenZ-1)
禁止使用楼梯 (stair)，垂直连接统一使用脚手架 (minecraft:scaffolding)
屋顶使用台阶 (_top / _bottom) 与完整方块配合搭建，边缘严格对齐墙体
地基即一楼地面，二楼及以上需单独铺设地板
大面积填充会被自动分割为 16×16 的区块，通过 tickingarea 和 structure 指令流畅执行
示例 AI 输出：
<fill>0,0,0,8,0,8,minecraft:stone</fill>
<fill>0,1,0,0,4,0,minecraft:oak_log</fill>
<fill>1,1,0,7,3,0,minecraft:oak_planks</fill>
<fill>0,5,0,8,5,8,minecraft:oak_slab_top</fill>
7. 权限说明
玩家需要 GameMaster 及以上权限（permLevel >= 1）才能使用本插件
服务端需开启作弊并允许执行命令
插件底层会调用 structure、tickingarea、fill 等管理员指令
8. 注意事项
save / load 的结构数据目前存储在内存中，服务端重启后会丢失
AI 生成受限于你的选区大小，坐标绝不会超出边界
建议选区大小适中，避免一次性让 AI 生成超大型建筑（如 200×200 城堡）导致指令队列过长
如遇生成失败，请检查 logs/ 目录下的插件日志

Usage
1. Requirements
LeviLamina server (Bedrock Dedicated Server)
LegacyScriptEngine with QuickJS​ + Python​ engines installed via lip
Python 3.10+ (match the LSE Python engine version requirement)
openai Python package
A DeepSeek API Key
# install LSE engines (example)
lip install github.com/LiteLDev/LegacyScriptEngine#quickjs
lip install github.com/LiteLDev/LegacyScriptEngine#python

# install python dependency
pip install openai
2. Install the plugin
Put the plugin folder under plugins/:
plugins/
└── deepseekbuilder/
    ├── deepseekbuilder.js
    ├── deepseekbuilder.py
    └── manifest.json   (auto-generated on first launch)
Then restart the server​ so LSE migrates and loads the plugin.
3. Configure DeepSeek API Key
Open deepseekbuilder.py and fill in your key:
DEEPSEEK_API_KEY = "sk-your-real-deepseek-key"
Do not commit your real key to public repos.
Get a key from: https://platform.deepseek.com
4. Select an area in-game
Hold an Iron Axe
Right-click a block → sets POS_A
Right-click another block → sets POS_B
The plugin shows the selection size automatically.
5. Commands
Base command: /deepseekbuilder
Short alias: /dsb
Generate a building from a prompt
/dsb generate
A form will appear:
Type what you want, e.g.:
a 2-floor medieval cabin with windows and a door
The AI returns compact build instructions
Blocks are placed automatically through a command queue
Run raw build tags directly
/dsb do "<fill>0,0,0,8,0,8,minecraft:stone</fill>"
Supported tags:
<fill>x0,y0,z0,x1,y1,z1,blockid</fill>
<save>x0,y0,z0,x1,y1,z1,name</save>
<load>x,y,z,name</load>
Coordinates are relative to your selection’s minimum corner.
View / re-run history
/dsb history
Browse past prompts
View AI output
Re-execute the latest generation inside a new selection
6. How the AI builds
Coordinates are local: (0,0,0) to (lenX-1, lenY-1, lenZ-1)
Roofs use slabs + full blocks, no stairs
Vertical access uses minecraft:scaffolding
Large areas are split into 16-block chunks
Uses tickingarea + structure commands internally
Example AI output:
<fill>0,0,0,8,0,8,minecraft:stone</fill>
<fill>0,1,0,0,4,0,minecraft:oak_log</fill>
<fill>1,1,0,7,3,0,minecraft:oak_planks</fill>
<fill>0,5,0,8,5,8,minecraft:oak_slab_top</fill>
7. Permissions
Players need GameMaster permission​ (permLevel >= 1)
Server must allow cheats / command execution
structure and tickingarea commands are used under the hood
8. Notes / limitations
save/load structures are stored per-player in memory
Restarting the server clears unsaved structures
AI output is constrained by your selection size
Keep selections reasonable (don’t request a 200×200 castle in one call)

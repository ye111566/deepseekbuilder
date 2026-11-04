// ============================================================
//  deepseekbuilder.js —— DeepSeek AI 建筑生成器
//  架构：Task(相对坐标) → Builder(世界坐标,返回指令数组) → CommandQueue(调度执行)
// ============================================================

/// <reference path="c:\Users\Lenovo/dts/HelperLib-master/src/index.d.ts"/> 

ll.registerPlugin(
    "deepseekbuilder",
    "DeepSeek AI 建筑生成器（含历史记录）",
    [1, 0, 3]
);

// ============================================================
//  全局：记录每个玩家 save 过的结构区域信息
// ============================================================
let g_savedStructures = {};

// 全局：历史记录缓存（供表单回调使用）
let g_historyCache = {};

// ============================================================
//  指令生成辅助函数
// ============================================================
function divideCoordinates(x1, y1, z1, x2, y2, z2) {
    const xMin = Math.min(x1, x2), xMax = Math.max(x1, x2);
    const zMin = Math.min(z1, z2), zMax = Math.max(z1, z2);
    const result = [];
    let isReversed = false;
    const STEP = 16;

    for (let xStart = xMin; xStart <= xMax; xStart += STEP) {
        const xEnd = Math.min(xStart + STEP - 1, xMax);
        if (isReversed) {
            for (let zStart = zMax; zStart >= zMin; zStart -= STEP) {
                const zEnd = Math.max(zStart - STEP + 1, zMin);
                if (zStart >= zEnd) {
                    result.push([[xStart, y1, zStart], [xEnd, y2, zEnd]]);
                }
                if (zEnd <= zMin) break;
            }
        } else {
            for (let zStart = zMin; zStart <= zMax; zStart += STEP) {
                const zEnd = Math.min(zStart + STEP - 1, zMax);
                if (zStart <= zEnd) {
                    result.push([[xStart, y1, zStart], [xEnd, y2, zEnd]]);
                }
                if (zEnd >= zMax) break;
            }
        }
        isReversed = !isReversed;
    }
    return result;
}

function normalizeBlockId(blockId) {
    const match = blockId.match(/^(.+_slab)_(bottom|top)$/);
    if (match) {
        let baseName = match[1];
        let half = match[2];
        if (!baseName.includes(':')) {
            baseName = 'minecraft:' + baseName;
        }
        return `${baseName}["minecraft:vertical_half"="${half}"]`;
    }
    return blockId;
}

function generateCommands(dimensionId, coordinates, blockId) {
    if (!Array.isArray(coordinates) || coordinates.some(item => item.length !== 2)) {
        throw new Error("坐标数组格式错误");
    }
    const commands = [];
    const biao = { 0: "overworld", 1: "nether", 2: "the_end" };
    blockId = normalizeBlockId(blockId);
    for (const [start, end] of coordinates) {
        const [x1, y1, z1] = start;
        const [x2, y2, z2] = end;
        commands.push(`execute as @s at @s in ${biao[dimensionId]} run tp @s ${x1} ${y1} ${z1}`);
        commands.push(`tickingarea remove dsb_area`);
        commands.push(`tickingarea add circle ~~~ 4 dsb_area true`);
        commands.push(`fill ${x1} ${y1} ${z1} ${x2} ${y2} ${z2} ${blockId}`);
    }
    commands.push(`tickingarea remove dsb_area`);
    return commands;
}

function saveCommands(dimensionId, coordinates, name, xuid) {
    if (!Array.isArray(coordinates) || coordinates.some(item => item.length !== 2)) {
        throw new Error("坐标数组格式错误");
    }
    const commands = [];
    const biao = { 0: "overworld", 1: "nether", 2: "the_end" };

    for (const [start, end] of coordinates) {
        const [x1, y1, z1] = start;
        const [x2, y2, z2] = end;
        const structName = `${name}_${x2}_${z2}`;
        commands.push(`execute as @s at @s in ${biao[dimensionId]} run tp @s ${x1} ${y1} ${z1}`);
        commands.push(`tickingarea remove dsb_area`);
        commands.push(`tickingarea add circle ~~~ 4 dsb_area true`);
        commands.push(`structure save ${structName} ${x1} ${y1} ${z1} ${x2} ${y2} ${z2}`);
    }
    commands.push(`tickingarea remove dsb_area`);
    return commands;
}

function loadCommands(dimensionId, coordinates, baseX, baseY, baseZ, name, saveMinX, saveMinY, saveMinZ) {
    if (!Array.isArray(coordinates) || coordinates.some(item => item.length !== 2)) {
        throw new Error("坐标数组格式错误");
    }
    const commands = [];
    const biao = { 0: "overworld", 1: "nether", 2: "the_end" };

    for (const [start, end] of coordinates) {
        const [relX1, relY1, relZ1] = start;
        const [relX2, relY2, relZ2] = end;

        const minRelX = Math.min(relX1, relX2);
        const minRelY = Math.min(relY1, relY2);
        const minRelZ = Math.min(relZ1, relZ2);
        const targetX = Math.floor(baseX + (minRelX - saveMinX));
        const targetY = Math.floor(baseY + (minRelY - saveMinY));
        const targetZ = Math.floor(baseZ + (minRelZ - saveMinZ));
        const structName = `${name}_${relX2}_${relZ2}`;

        commands.push(`execute as @s at @s in ${biao[dimensionId]} run tp @s ${targetX} ${targetY} ${targetZ}`);
        commands.push(`tickingarea remove dsb_area`);
        commands.push(`tickingarea add circle ~~~ 4 dsb_area true`);
        commands.push(`structure load ${structName} ${targetX} ${targetY} ${targetZ}`);
    }
    commands.push(`tickingarea remove dsb_area`);
    return commands;
}

// ============================================================
//  指令任务队列维护系统
// ============================================================
let CommandQueue = {
    queues: {},

    enqueue(xuid, commands, taskName = "DSB-执行中", onComplete = null) {
        let player = mc.getPlayer(xuid);
        if (!player) {
            log(`[CommandQueue] 玩家 ${xuid} 不在线，丢弃任务`);
            return false;
        }
        if (!commands || commands.length === 0) {
            log(`[CommandQueue] 指令数组为空，跳过`);
            return false;
        }

        if (this.queues[xuid]) {
            this.stop(xuid);
        }

        let queue = {
            xuid: xuid,
            player: player,
            commands: commands,
            total: commands.length,
            index: 0,
            taskName: taskName,
            bossBarId: 114530 + Object.keys(this.queues).length,
            onComplete: onComplete,
            intervalId: null,
            startPos: new IntPos(player.pos.x, player.pos.y, player.pos.z, player.pos.dimid)
        };

        this.queues[xuid] = queue;
        this._start(queue);

        log(`[CommandQueue] 任务已提交: ${taskName}, 共 ${commands.length} 条指令, 玩家=${xuid}`);
        return true;
    },

    _start(queue) {
        let self = this;
        queue.intervalId = setInterval(() => {
            if (!queue.player) {
                log(`[CommandQueue] 玩家 ${queue.xuid} 离线，终止任务`);
                self.stop(queue.xuid);
                return;
            }

            if (queue.index >= queue.total) {
                self._finish(queue);
                return;
            }

            let progress = Math.floor(100 * queue.index / queue.total);
            queue.player.setBossBar(queue.bossBarId, queue.taskName, progress, 2);

            let cmd = queue.commands[queue.index];
            queue.player.runcmd(cmd);
            queue.index++;

        }, 50);
    },

    _finish(queue) {
        clearInterval(queue.intervalId);

        if (queue.player) {
            queue.player.removeBossBar(queue.bossBarId);
            queue.player.tell(`§a[${queue.taskName}] §f完成！共执行 §e${queue.total} §f条指令`);
            queue.player.teleport(queue.startPos);
        }

        delete this.queues[queue.xuid];

        if (queue.onComplete) {
            queue.onComplete(queue);
        }

        log(`[CommandQueue] 任务完成: ${queue.taskName}, ${queue.total} 条指令`);
    },

    stop(xuid) {
        let queue = this.queues[xuid];
        if (!queue) return;

        clearInterval(queue.intervalId);
        if (queue.player) {
            queue.player.removeBossBar(queue.bossBarId);
            queue.player.tell(`§c[${queue.taskName}] §f已取消`);
        }
        delete this.queues[xuid];
        log(`[CommandQueue] 任务已停止: ${xuid}`);
    },

    stopAll() {
        for (let xuid in this.queues) {
            this.stop(xuid);
        }
    }
};

// ============================================================
//  Builder 类
// ============================================================
class Builder {

    static fill(x0, y0, z0, x1, y1, z1, blockid, xuid, dimid) {
        let handled = divideCoordinates(x0, y0, z0, x1, y1, z1);
        return generateCommands(dimid, handled, blockid);
    }

    static save(x0, y0, z0, x1, y1, z1, name, xuid, dimid) {
        let xMin = Math.min(x0, x1), xMax = Math.max(x0, x1);
        let yMin = Math.min(y0, y1), yMax = Math.max(y0, y1);
        let zMin = Math.min(z0, z1), zMax = Math.max(z0, z1);

        g_savedStructures[`${xuid}_${name}`] = {
            saveMinX: xMin, saveMinY: yMin, saveMinZ: zMin,
            saveMaxX: xMax, saveMaxY: yMax, saveMaxZ: zMax,
            dimid: dimid
        };

        let handled = divideCoordinates(xMin, yMin, zMin, xMax, yMax, zMax);
        return saveCommands(dimid, handled, name, xuid);
    }

    static load(xuid, dimid, baseX, baseY, baseZ, name) {
        let key = `${xuid}_${name}`;
        let saved = g_savedStructures[key];
        if (!saved) {
            log(`[Builder.load] 错误：找不到保存记录 ${key}`);
            return [];
        }

        let handled = divideCoordinates(
            saved.saveMinX, saved.saveMinY, saved.saveMinZ,
            saved.saveMaxX, saved.saveMaxY, saved.saveMaxZ
        );

        return loadCommands(
            dimid, handled,
            baseX, baseY, baseZ,
            name,
            saved.saveMinX, saved.saveMinY, saved.saveMinZ
        );
    }
}

// ============================================================
//  Task 类
// ============================================================
class Task {
    static pool = [];

    constructor(minx, miny, minz, lenx, leny, lenz, dimid, xuid) {
        this.minx = minx;
        this.miny = miny;
        this.minz = minz;
        this.lenx = lenx;
        this.leny = leny;
        this.lenz = lenz;
        this.dimid = dimid;
        this.xuid = xuid;

        this.taskid = Task.pool.length;
        Task.pool[this.taskid] = this;
    }

    fill(x0, y0, z0, x1, y1, z1, blockid) {
        let ax0 = this.minx + x0, ay0 = this.miny + y0, az0 = this.minz + z0;
        let ax1 = this.minx + x1, ay1 = this.miny + y1, az1 = this.minz + z1;
        return Builder.fill(ax0, ay0, az0, ax1, ay1, az1, blockid, this.xuid, this.dimid);
    }

    save(x0, y0, z0, x1, y1, z1, name) {
        let ax0 = this.minx + x0, ay0 = this.miny + y0, az0 = this.minz + z0;
        let ax1 = this.minx + x1, ay1 = this.miny + y1, az1 = this.minz + z1;
        return Builder.save(ax0, ay0, az0, ax1, ay1, az1, name, this.xuid, this.dimid);
    }

    load(x, y, z, name) {
        let baseX = this.minx + x;
        let baseY = this.miny + y;
        let baseZ = this.minz + z;
        return Builder.load(this.xuid, this.dimid, baseX, baseY, baseZ, name);
    }
}

// ============================================================
//  handletext —— 解析 AI 返回的紧凑标签文本
// ============================================================
function handletext(text, task) {
    if (!text || typeof text !== 'string') {
        log('[handletext] 错误：text 为空或非字符串');
        return;
    }

    log(`[handletext] 开始解析，文本长度=${text.length}, TaskID=${task.taskid}`);

    let allCommands = [];
    let regex = /<(fill|save|load)>([^<]+)<\/\1>/g;
    let match;
    let callCount = 0;

    while ((match = regex.exec(text)) !== null) {
        let type = match[1];
        let content = match[2];
        let parts = content.split(',');

        try {
            switch (type) {
                case 'fill': {
                    if (parts.length < 7) throw new Error(`fill 参数不足: ${content}`);
                    let fx0 = parseInt(parts[0]), fy0 = parseInt(parts[1]), fz0 = parseInt(parts[2]);
                    let fx1 = parseInt(parts[3]), fy1 = parseInt(parts[4]), fz1 = parseInt(parts[5]);
                    let fblock = parts[6].trim();
                    let cmds = task.fill(fx0, fy0, fz0, fx1, fy1, fz1, fblock);
                    allCommands.push(...cmds);
                    callCount++;
                    break;
                }

                case 'save': {
                    if (parts.length < 7) throw new Error(`save 参数不足: ${content}`);
                    let sx0 = parseInt(parts[0]), sy0 = parseInt(parts[1]), sz0 = parseInt(parts[2]);
                    let sx1 = parseInt(parts[3]), sy1 = parseInt(parts[4]), sz1 = parseInt(parts[5]);
                    let sname = parts[6].trim();
                    let cmds = task.save(sx0, sy0, sz0, sx1, sy1, sz1, sname);
                    allCommands.push(...cmds);
                    callCount++;
                    break;
                }

                case 'load': {
                    if (parts.length < 4) throw new Error(`load 参数不足: ${content}`);
                    let lx = parseInt(parts[0]), ly = parseInt(parts[1]), lz = parseInt(parts[2]);
                    let lname = parts[3].trim();
                    let cmds = task.load(lx, ly, lz, lname);
                    allCommands.push(...cmds);
                    callCount++;
                    break;
                }
            }
        } catch (e) {
            log(`[handletext] 解析 ${type} 失败: ${e.message}, content="${content}"`);
        }
    }

    log(`[handletext] 解析完成，共 ${callCount} 个 API 调用，${allCommands.length} 条指令`);

    if (allCommands.length > 0) {
        CommandQueue.enqueue(task.xuid, allCommands, `DSB-任务#${task.taskid}`);
    } else {
        let player = mc.getPlayer(task.xuid);
        if (player) {
            player.tell("§c解析完成但未生成任何有效指令，请检查 AI 输出格式");
        }
    }
}

// ============================================================
//  全局选区数据
// ============================================================
let posdata = {};

// ============================================================
//  铁斧选区监听
// ============================================================
let clickCache = new Map();
mc.listen("onUseItemOn", (player, item, block, side, pos) => {
    if (!player.xuid) return;
    if (player.permLevel == 0) return;
    if (item.type !== "minecraft:iron_axe") return;

    if (clickCache.has(player.xuid)) return;
    clickCache.set(player.xuid, true);
    setTimeout(() => clickCache.delete(player.xuid), 500);

    let xuid = player.xuid;
    if (!posdata[xuid]) {
        posdata[xuid] = { posa: [], posb: [], dimid: 0 };
    }

    let sel = posdata[xuid];
    let p = [block.pos.x, block.pos.y, block.pos.z];
    let dimid = block.pos.dimid;

    if (sel.posa.length === 0) {
        sel.posa = p;
        sel.dimid = dimid;
        player.tell(`§b[选区] §aPOS_A §f= (${p[0]}, ${p[1]}, ${p[2]})`);
    } else if (sel.posb.length === 0) {
        sel.posb = p;
        sel.dimid = dimid;
        let dx = Math.abs(sel.posb[0] - sel.posa[0]) + 1;
        let dy = Math.abs(sel.posb[1] - sel.posa[1]) + 1;
        let dz = Math.abs(sel.posb[2] - sel.posa[2]) + 1;
        player.tell(`§b[选区] §aPOS_B §f= (${p[0]}, ${p[1]}, ${p[2]})`);
        player.tell(`§e[选区] §f完成！大小: ${dx} × ${dy} × ${dz}，共 ${dx * dy * dz} 个方块`);
    } else {
        sel.posa = p;
        sel.posb = [];
        sel.dimid = dimid;
        player.tell(`§b[选区] §c已重置！§a新POS_A §f= (${p[0]}, ${p[1]}, ${p[2]})`);
    }
});

// ============================================================
//  指令注册
// ============================================================
mc.listen('onServerStarted', () => {
    let dsbCmd = mc.newCommand("deepseekbuilder", '§dDeepSeek AI 建筑生成器', PermType.GameMasters);
    dsbCmd.setAlias("dsb");

    dsbCmd.setEnum('action', ['generate', 'do', 'history']);
    dsbCmd.mandatory('action', ParamType.Enum, 'action', 1);
    dsbCmd.optional('content', ParamType.String, 'content', 1);

    dsbCmd.overload(['action']);
    dsbCmd.overload(['action', 'content']);

    dsbCmd.setCallback((cmd, origin, out, res) => {
        let theplayer = origin.player;
        if (!theplayer) {
            out.error("此指令只能在游戏内执行");
            return;
        }
        if (theplayer.permLevel == 0) {
            theplayer.tell("§c您没有权限使用 deepseekbuilder！");
            return;
        }

        let action = res["action"];

        // ==================== /dsb generate ====================
        if (action === "generate") {
            let fm = mc.newCustomForm();
            fm.setTitle("DeepSeek Builder - 需求描述");
            fm.addInput("描述你的建筑需求:", "例如：在选区内生成一个中世纪城堡", "");
            fm.addLabel("§7提示：请确保你已用铁斧完成选区（两点）");

            theplayer.sendForm(fm, (player, data, reason) => {
                if (!data) {
                    player.tell("§c已取消");
                    return;
                }

                let prompt = data[0];
                if (!prompt || prompt.trim() === "") {
                    player.tell("§c需求描述不能为空！");
                    return;
                }

                let sel = posdata[player.xuid];
                if (!sel || sel.posa.length === 0 || sel.posb.length === 0) {
                    player.tell("§c请先用铁斧选区（点两下）！");
                    return;
                }

                let minx = Math.min(sel.posa[0], sel.posb[0]);
                let miny = Math.min(sel.posa[1], sel.posb[1]);
                let minz = Math.min(sel.posa[2], sel.posb[2]);
                let lenx = Math.abs(sel.posa[0] - sel.posb[0]) + 1;
                let leny = Math.abs(sel.posa[1] - sel.posb[1]) + 1;
                let lenz = Math.abs(sel.posa[2] - sel.posb[2]) + 1;
                let dimid = sel.dimid;

                let task = new Task(minx, miny, minz, lenx, leny, lenz, dimid, player.xuid);
                player.tell(`§a任务已创建，TaskID: §e${task.taskid}`);

                let uuid = player.uuid;
                let safePrompt = `<limit>${lenx},${leny},${lenz}</limit>` + prompt.replace(/"/g, '\\"');
                
                let pyCmd = `python plugins/deepseekbuilder/deepseekbuilder.py "${uuid}" "${safePrompt}" "${task.taskid}"`;

                log(`[DSB] 执行: ${pyCmd}`);
                player.tell("§e正在调用 DeepSeek 生成中，请稍候...");

                system.cmd(pyCmd, (exitcode, output) => {
                    output = output.replace(/[\x00-\x1F\x7F]/g, '').trim();
                    log(`[DSB] py输出: ${output}`);

                    if (exitcode === 0) {
                        handletext(output, task);
                        player.tell("§a生成完成！已提交执行队列。");
                    } else {
                        player.tell(`§c生成失败，退出码: ${exitcode}`);
                        log(`[DSB] 错误输出: ${output}`);
                    }
                });
            });
        }

        // ==================== /dsb do "xxx" ====================
        else if (action === "do") {
            let content = res["content"];
            if (!content || content.trim() === "") {
                theplayer.tell("§c请提供要执行的内容！用法: /dsb do \"<fill>0,0,0,10,0,10,minecraft:stone</fill>\"");
                return;
            }

            let sel = posdata[theplayer.xuid];
            if (!sel || sel.posa.length === 0 || sel.posb.length === 0) {
                theplayer.tell("§c请先用铁斧选区（点两下）！");
                return;
            }

            let minx = Math.min(sel.posa[0], sel.posb[0]);
            let miny = Math.min(sel.posa[1], sel.posb[1]);
            let minz = Math.min(sel.posa[2], sel.posb[2]);
            let lenx = Math.abs(sel.posa[0] - sel.posb[0]) + 1;
            let leny = Math.abs(sel.posa[1] - sel.posb[1]) + 1;
            let lenz = Math.abs(sel.posa[2] - sel.posb[2]) + 1;
            let dimid = sel.dimid;

            let task = new Task(minx, miny, minz, lenx, leny, lenz, dimid, theplayer.xuid);
            theplayer.tell(`§a任务已创建，TaskID: §e${task.taskid}`);
            theplayer.tell(`§e正在直接执行 ${content.length} 字符的内容...`);
            log(`[DSB/do] 直接执行模式，内容: ${content}`);

            handletext(content, task);
            theplayer.tell("§a执行完成！已提交执行队列。");
        }

        // ==================== /dsb history ====================
        else if (action === "history") {
            let contexts = new JsonConfigFile("./deepseekbuilder.json");
            let history = contexts.get(theplayer.uuid) || [];
            
            let fm = mc.newSimpleForm();
            fm.setTitle("DeepSeek Builder - 历史记录");
            fm.addButton("🗑 清空历史对话");
            
            // 倒序排列，最新的在前
            g_historyCache[theplayer.uuid] = history.slice().reverse();
            let reversedHistory = g_historyCache[theplayer.uuid];
            
            for (let i = 0; i < reversedHistory.length; i++) {
                let item = reversedHistory[i];
                if (item.role === 'user') {
                    let display = item.content.replace(/<limit>.*?<\/limit>/, '').substring(0, 15);
                    fm.addButton(`📜 ${display}...`);
                }
            }
            
            theplayer.sendForm(fm, (player, id, reason) => {
                if (id === null) return;
                
                if (id === 0) {
                    contexts.delete(player.uuid);
                    player.tell("§a历史对话已清空");
                    return;
                }
                
                let histIndex = id - 1;
                let selectedItem = g_historyCache[player.uuid][histIndex];
                
                // 找对应的 assistant 回复
                let assistantReply = "";
                if (selectedItem.role === 'user') {
                    let origIndex = history.indexOf(selectedItem);
                    if (origIndex !== -1 && origIndex < history.length - 1 && history[origIndex+1].role === 'assistant') {
                        assistantReply = history[origIndex+1].content;
                    }
                } else if (selectedItem.role === 'assistant') {
                    assistantReply = selectedItem.content;
                }
                
                // 打开详情表单
                let detailFm = mc.newCustomForm();
                detailFm.setTitle("历史详情");
                detailFm.addLabel(`§e你的描述:`);
                let userContent = selectedItem.role === 'user' ? selectedItem.content.replace(/<limit>.*?<\/limit>/, '') : "（非用户消息）";
                detailFm.addLabel(userContent);
                
                detailFm.addLabel(`§bAI 生成结果:`);
                if (assistantReply) {
                    let displayReply = assistantReply.length > 500 ? assistantReply.substring(0, 500) + "..." : assistantReply;
                    detailFm.addLabel(displayReply);
                } else {
                    detailFm.addLabel("§c没有生成出回复");
                }
                
                // 只有最后一条（histIndex === 0）才显示重新执行按钮
                let isLast = (histIndex === 0);
                if (isLast && assistantReply) {
                    detailFm.addSwitch("🔄 重新执行（需先选区）", false);
                }
                
                player.sendForm(detailFm, (pl, data, rsn) => {
                    if (!data) return;
                    
                    // 如果有重新执行开关且被勾选
                    if (isLast && assistantReply && data[data.length - 1]) {
                        // ✅ 选区检查
                        let sel = posdata[pl.xuid];
                        if (!sel || sel.posa.length === 0 || sel.posb.length === 0) {
                            pl.tell("§c请先用铁斧选区（点两下）才能重新执行！");
                            return;
                        }
                        
                        // 用当前选区创建新任务
                        let minx = Math.min(sel.posa[0], sel.posb[0]);
                        let miny = Math.min(sel.posa[1], sel.posb[1]);
                        let minz = Math.min(sel.posa[2], sel.posb[2]);
                        let lenx = Math.abs(sel.posa[0] - sel.posb[0]) + 1;
                        let leny = Math.abs(sel.posa[1] - sel.posb[1]) + 1;
                        let lenz = Math.abs(sel.posa[2] - sel.posb[2]) + 1;
                        let dimid = sel.dimid;
                        
                        let task = new Task(minx, miny, minz, lenx, leny, lenz, dimid, pl.xuid);
                        pl.tell(`§a重新执行任务已创建，TaskID: §e${task.taskid}`);
                        pl.tell("§e正在重新解析并执行 AI 生成的标签...");
                        
                        // ✅ 直接重新执行，不再调 Python
                        handletext(assistantReply, task);
                        pl.tell("§a重新执行完成！已提交执行队列。");
                    }
                });
            });
        }
    });

    dsbCmd.setup();
});
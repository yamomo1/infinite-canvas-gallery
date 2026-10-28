// 在线画布对话：直接调用用户配置的 OpenAI 兼容接口（New API /v1），
// 不依赖本地 Codex Agent。
//
// 模型可以返回一段 ```canvas-ops JSON，用来直接改画布（新增/修改/删除节点、
// 连线、视口、触发一次生成）。前端解析后交给 canvasContext.applyOps 执行。
import type { AiConfig } from "@/stores/use-config-store";

import { requestImageQuestion, type AiTextMessage } from "@/services/api/image";
import type { CanvasAgentOp, CanvasAgentSnapshot } from "@/lib/canvas/canvas-agent-ops";

export type OnlineChatRole = "user" | "assistant";
export type OnlineChatMessage = {
    id: string;
    role: OnlineChatRole;
    text: string;
    ops?: CanvasAgentOp[];
    error?: boolean;
};

const OPS_FENCE = /```canvas-ops\s*([\s\S]*?)```/i;
const MAX_NODES_IN_PROMPT = 60;

/** 把画布现状压成一段紧凑文本，作为模型上下文 */
export function summarizeSnapshot(snapshot: CanvasAgentSnapshot): string {
    const nodes = snapshot.nodes.slice(0, MAX_NODES_IN_PROMPT).map((node) => {
        const meta = node.metadata ?? {};
        const brief = [meta.prompt, meta.content].filter(Boolean).join(" / ").slice(0, 80);
        return `- ${node.id} | ${node.type} | ${node.title || "(无标题)"} | x=${Math.round(node.position.x)},y=${Math.round(node.position.y)}${brief ? ` | ${brief}` : ""}`;
    });
    const connections = snapshot.connections.map((conn) => `- ${conn.fromNodeId} -> ${conn.toNodeId}`);
    return [
        `画布标题：${snapshot.title}`,
        `节点数：${snapshot.nodes.length}`,
        nodes.length ? `节点列表（最多 ${MAX_NODES_IN_PROMPT} 条）：\n${nodes.join("\n")}` : "节点列表：空画布",
        connections.length ? `连线：\n${connections.join("\n")}` : "连线：无",
        `当前选中：${snapshot.selectedNodeIds.length ? snapshot.selectedNodeIds.join("、") : "无"}`,
    ].join("\n");
}

const OPS_SCHEMA = `可用操作（数组元素，字段按需给）：
- {"type":"add_node","nodeType":"text|image|video|audio|config|group","title":"...","x":0,"y":0,"metadata":{"prompt":"...","content":"..."}}
- {"type":"update_node","id":"节点id","patch":{"title":"..."},"metadata":{"prompt":"..."}}
- {"type":"delete_node","id":"节点id"} 或 {"type":"delete_node","ids":["a","b"]}
- {"type":"connect_nodes","fromNodeId":"a","toNodeId":"b"}
- {"type":"set_viewport","viewport":{"x":0,"y":0,"k":1}}
- {"type":"run_generation","nodeId":"节点id","mode":"text|image|video"}`;

/** 系统提示：角色 + 画布上下文 + 输出约定 */
export function buildSystemPrompt(snapshot: CanvasAgentSnapshot): string {
    return [
        "你是无限画布里的创作助手，帮助用户拆解创意、撰写提示词、规划节点与连线。",
        "回答用中文，简洁、可执行；不确定时先问清楚再动手。",
        "",
        "## 当前画布",
        summarizeSnapshot(snapshot),
        "",
        "## 需要改动画布时",
        "在回答的最后追加一个代码块，语言标记写 canvas-ops，内容是你想执行的操作 JSON 数组：",
        "```canvas-ops",
        "[{\"type\":\"add_node\",\"nodeType\":\"text\",\"title\":\"镜头描述\",\"x\":0,\"y\":0,\"metadata\":{\"content\":\"...\"}}]",
        "```",
        OPS_SCHEMA,
        "只输出确实需要执行的操作；不需要改画布时不要输出这个代码块。",
    ].join("\n");
}

/** 从模型输出里拆出正文与 canvas-ops */
export function splitCanvasOps(text: string): { text: string; ops: CanvasAgentOp[] } {
    const match = text.match(OPS_FENCE);
    if (!match) return { text: text.trim(), ops: [] };
    const body = text.replace(OPS_FENCE, "").trim();
    try {
        const parsed = JSON.parse(match[1].trim()) as unknown;
        const ops = (Array.isArray(parsed) ? parsed : [parsed]).filter(
            (op): op is CanvasAgentOp => Boolean(op && typeof op === "object" && typeof (op as { type?: unknown }).type === "string"),
        );
        return { text: body, ops };
    } catch {
        // 解析失败就把原始代码块留在正文里，用户至少能看到内容
        return { text: text.trim(), ops: [] };
    }
}

export type StreamCanvasChatParams = {
    config: AiConfig;
    snapshot: CanvasAgentSnapshot;
    history: OnlineChatMessage[];
    onDelta: (text: string) => void;
    signal?: AbortSignal;
};

/** 流式对话：返回完整文本（含可能存在的 canvas-ops 代码块） */
export async function streamCanvasChat({ config, snapshot, history, onDelta, signal }: StreamCanvasChatParams): Promise<string> {
    const messages: AiTextMessage[] = [
        { role: "system", content: buildSystemPrompt(snapshot) },
        ...history
            .filter((item) => item.text.trim() !== "")
            .map((item) => ({ role: item.role, content: item.text })),
    ];
    return requestImageQuestion(config, messages, onDelta, { signal });
}

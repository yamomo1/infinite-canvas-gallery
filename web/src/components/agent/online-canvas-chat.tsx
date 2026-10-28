import { useEffect, useRef, useState } from "react";
import { App } from "antd";
import { nanoid } from "nanoid";
import { ArrowUp, Eraser, Settings2, Sparkles, Square, Wand2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { streamCanvasChat, splitCanvasOps, type OnlineChatMessage } from "@/services/canvas-chat";
import { useCanvasChatStore } from "@/stores/use-canvas-chat-store";
import { useAgentStore } from "@/stores/use-agent-store";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { canvasThemes } from "@/lib/canvas-theme";
import { cn } from "@/lib/utils";

/**
 * 在线画布对话：直接用 New API（OpenAI 兼容）里的文本模型对话，
 * 不需要本地 Codex。模型可以返回 canvas-ops 让画布自动增删节点/连线。
 */
export function OnlineCanvasChat({ embedded }: { embedded?: boolean }) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const themeKey = useThemeStore((state) => state.theme);
    const theme = canvasThemes[themeKey];
    const accent = themeKey === "dark" ? "#f5f5f4" : "#1c1917";
    const accentInk = themeKey === "dark" ? "#1c1917" : "#fbfaf7";
    const config = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const projectId = useAgentStore((state) => state.canvasContext?.snapshot.projectId) ?? "";
    const thread = useCanvasChatStore((state) => (projectId ? state.threads[projectId] : undefined)) ?? [];
    const appendMessage = useCanvasChatStore((state) => state.appendMessage);
    const updateMessage = useCanvasChatStore((state) => state.updateMessage);
    const clearThread = useCanvasChatStore((state) => state.clearThread);
    const pendingPrompt = useCanvasChatStore((state) => state.pendingPrompt);
    const consumePendingPrompt = useCanvasChatStore((state) => state.consumePendingPrompt);

    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const [streamingText, setStreamingText] = useState("");
    const abortRef = useRef<AbortController | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    const textModel = config.textModel || config.model;
    const modelLabel = (textModel || "").split("::").pop() || t("agent.online.noModel");
    const ready = Boolean(projectId) && isAiConfigReady(config, textModel);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [thread.length, streamingText]);

    useEffect(() => () => abortRef.current?.abort(), []);

    const send = async (overrideText?: string) => {
        const text = (overrideText ?? input).trim();
        const context = useAgentStore.getState().canvasContext;
        if (!text || sending || !context || !projectId) return;
        setInput("");
        appendMessage(projectId, { id: nanoid(), role: "user", text });
        const assistantId = nanoid();
        setSending(true);
        setStreamingText("");
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const full = await streamCanvasChat({
                config,
                snapshot: context.snapshot,
                history: [...thread, { id: "pending", role: "user", text }],
                onDelta: (delta) => setStreamingText((prev) => prev + delta),
                signal: controller.signal,
            });
            const { text: body, ops } = splitCanvasOps(full);
            appendMessage(projectId, { id: assistantId, role: "assistant", text: body || full, ops });
        } catch (error) {
            if ((error as Error)?.name === "AbortError" || controller.signal.aborted) {
                appendMessage(projectId, { id: assistantId, role: "assistant", text: t("agent.online.stopped") });
            } else {
                appendMessage(projectId, { id: assistantId, role: "assistant", text: error instanceof Error ? error.message : String(error), error: true });
            }
        } finally {
            setSending(false);
            setStreamingText("");
            abortRef.current = null;
        }
    };

    const stop = () => abortRef.current?.abort();

    // 欢迎引导等外部入口发来的首条消息：面板就绪后自动发送
    useEffect(() => {
        if (!pendingPrompt || !projectId || sending) return;
        const text = pendingPrompt;
        consumePendingPrompt();
        void send(text);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingPrompt, projectId]);

    const applyOps = (item: OnlineChatMessage) => {
        const context = useAgentStore.getState().canvasContext;
        if (!context || !item.ops?.length) return;
        context.applyOps(item.ops);
        updateMessage(projectId, item.id, { ops: undefined });
        message.success(t("agent.online.applied", { count: item.ops.length }));
    };

    const presets = [t("agent.online.preset1"), t("agent.online.preset2"), t("agent.online.preset3")];

    return (
        <div className={cn("flex h-full min-h-0 w-full flex-col", embedded ? "" : "px-4")} style={{ background: embedded ? undefined : theme.node.panel }}>
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2" style={{ borderColor: theme.node.stroke }}>
                <div className="flex min-w-0 items-center gap-2">
                    <Sparkles className="size-4 shrink-0" style={{ color: accent }} />
                    <span className="truncate text-sm font-medium">{t("agent.online.title")}</span>
                    <span className="max-w-[10rem] shrink-0 truncate rounded-full border px-2 py-0.5 text-[11px] opacity-70" style={{ borderColor: theme.node.stroke }}>
                        {modelLabel}
                    </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <button type="button" className="rounded p-1 opacity-60 transition hover:opacity-100" title={t("agent.online.clear")} onClick={() => projectId && clearThread(projectId)}>
                        <Eraser className="size-4" />
                    </button>
                    <button type="button" className="rounded p-1 opacity-60 transition hover:opacity-100" title={t("agent.online.config")} onClick={() => openConfigDialog(false)}>
                        <Settings2 className="size-4" />
                    </button>
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                {thread.length === 0 && !sending ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-xs opacity-70">
                        <Wand2 className="size-6" />
                        <p className="max-w-[16rem] leading-5">{t("agent.online.empty")}</p>
                        <div className="flex flex-col gap-2">
                            {presets.map((preset) => (
                                <button
                                    key={preset}
                                    type="button"
                                    className="rounded-lg border px-3 py-1.5 text-left transition hover:opacity-100"
                                    style={{ borderColor: theme.node.stroke }}
                                    onClick={() => setInput(preset)}
                                >
                                    {preset}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : null}

                <div className="flex flex-col gap-3">
                    {thread.map((item) => (
                        <div key={item.id} className={cn("flex", item.role === "user" ? "justify-end" : "justify-start")}>
                            <div
                                className={cn("max-w-[92%] rounded-xl px-3 py-2 text-[13px] leading-6 whitespace-pre-wrap break-words")}
                                style={
                                    item.role === "user"
                                        ? { background: accent, color: accentInk }
                                        : { background: theme.node.fill, border: `1px solid ${theme.node.stroke}`, color: item.error ? "#e5484d" : undefined }
                                }
                            >
                                {item.text}
                                {item.ops?.length ? (
                                    <div className="mt-2 flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[12px]" style={{ borderColor: theme.node.stroke }}>
                                        <span className="flex-1">{t("agent.online.opsReady", { count: item.ops.length })}</span>
                                        <button type="button" className="rounded px-2 py-0.5 font-medium" style={{ background: accent, color: accentInk }} onClick={() => applyOps(item)}>
                                            {t("agent.online.apply")}
                                        </button>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    ))}

                    {sending ? (
                        <div className="flex justify-start">
                            <div className="max-w-[92%] rounded-xl px-3 py-2 text-[13px] leading-6 whitespace-pre-wrap break-words" style={{ background: theme.node.fill, border: `1px solid ${theme.node.stroke}` }}>
                                {streamingText || <span className="opacity-60">{t("agent.online.thinking")}</span>}
                            </div>
                        </div>
                    ) : null}
                    <div ref={bottomRef} />
                </div>
            </div>

            <div className="border-t px-3 py-2" style={{ borderColor: theme.node.stroke }}>
                {!ready ? (
                    <button type="button" className="mb-2 w-full rounded-lg border border-dashed px-3 py-2 text-left text-[12px] leading-5 opacity-80" style={{ borderColor: theme.node.stroke }} onClick={() => openConfigDialog(false)}>
                        {t("agent.online.setupHint")}
                    </button>
                ) : null}
                <div className="flex items-end gap-2">
                    <textarea
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault();
                                void send();
                            }
                        }}
                        rows={2}
                        placeholder={t("agent.online.placeholder")}
                        className="max-h-32 min-h-16 flex-1 resize-none rounded-lg border bg-transparent px-3 py-2 text-[13px] leading-5 outline-none"
                        style={{ borderColor: theme.node.stroke, color: theme.node.text }}
                    />
                    <button
                        type="button"
                        className="flex size-9 shrink-0 items-center justify-center rounded-lg disabled:opacity-40"
                        style={{ background: accent, color: accentInk }}
                        disabled={!ready || (!sending && !input.trim())}
                        onClick={sending ? stop : () => void send()}
                        aria-label={sending ? t("agent.online.stop") : t("agent.online.send")}
                    >
                        {sending ? <Square className="size-4" /> : <ArrowUp className="size-4" />}
                    </button>
                </div>
            </div>
        </div>
    );
}

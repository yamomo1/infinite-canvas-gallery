import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { OnlineChatMessage } from "@/services/canvas-chat";

export type AgentPanelMode = "online" | "local";

const MAX_MESSAGES_PER_PROJECT = 60;

type CanvasChatStore = {
    /** 右侧面板用哪种 Agent：在线模型（默认）或本地 Codex */
    mode: AgentPanelMode;
    setMode: (mode: AgentPanelMode) => void;
    /** 每个画布一份对话记录（key = projectId） */
    threads: Record<string, OnlineChatMessage[]>;
    /** 欢迎引导等外部入口要发送的一条消息（面板打开后由 OnlineCanvasChat 消费） */
    pendingPrompt: string | null;
    setPendingPrompt: (text: string) => void;
    consumePendingPrompt: () => void;
    appendMessage: (projectId: string, message: OnlineChatMessage) => void;
    updateMessage: (projectId: string, id: string, patch: Partial<OnlineChatMessage>) => void;
    clearThread: (projectId: string) => void;
};

export const useCanvasChatStore = create<CanvasChatStore>()(
    persist(
        (set) => ({
            mode: "online",
            setMode: (mode) => set({ mode }),
            threads: {},
            pendingPrompt: null,
            setPendingPrompt: (text) => set({ pendingPrompt: text }),
            consumePendingPrompt: () => set({ pendingPrompt: null }),
            appendMessage: (projectId, message) =>
                set((state) => {
                    const existing = state.threads[projectId] ?? [];
                    const next = [...existing, message].slice(-MAX_MESSAGES_PER_PROJECT);
                    return { threads: { ...state.threads, [projectId]: next } };
                }),
            updateMessage: (projectId, id, patch) =>
                set((state) => {
                    const existing = state.threads[projectId] ?? [];
                    return {
                        threads: {
                            ...state.threads,
                            [projectId]: existing.map((item) => (item.id === id ? { ...item, ...patch } : item)),
                        },
                    };
                }),
            clearThread: (projectId) =>
                set((state) => {
                    const next = { ...state.threads };
                    delete next[projectId];
                    return { threads: next };
                }),
        }),
        { name: "infinite-canvas:canvas_chat", partialize: (state) => ({ mode: state.mode, threads: state.threads }) },
    ),
);

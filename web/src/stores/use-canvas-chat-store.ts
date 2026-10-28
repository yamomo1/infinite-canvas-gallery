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
        { name: "infinite-canvas:canvas_chat" },
    ),
);

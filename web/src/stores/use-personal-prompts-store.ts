import { create } from "zustand";
import { persist } from "zustand/middleware";

export type PersonalPrompt = {
    id: string;
    title: string;
    prompt: string;
    tags: string[];
    createdAt: number;
};

type PersonalPromptStore = {
    prompts: PersonalPrompt[];
    addPrompt: (title: string, prompt: string) => PersonalPrompt;
    removePrompt: (id: string) => void;
};

export const usePersonalPromptStore = create<PersonalPromptStore>()(
    persist(
        (set) => ({
            prompts: [],
            addPrompt: (title, prompt) => {
                const item: PersonalPrompt = {
                    id: `pp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                    title: title.trim() || prompt.trim().slice(0, 24) || "未命名提示词",
                    prompt: prompt.trim(),
                    tags: [],
                    createdAt: Date.now(),
                };
                if (!item.prompt) return item;
                set((state) => ({ prompts: [item, ...state.prompts] }));
                return item;
            },
            removePrompt: (id) => set((state) => ({ prompts: state.prompts.filter((item) => item.id !== id) })),
        }),
        { name: "infinite-canvas:personal_prompts" },
    ),
);

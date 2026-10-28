import { create } from "zustand";
import { persist } from "zustand/middleware";

export type PersonalPrompt = {
    id: string;
    title: string;
    prompt: string;
    category: string;
    tags: string[];
    createdAt: number;
};

/** 默认分类：人物 / 场景 / 风格 / 其他（用户可自建新分类，落库后自动出现在选项里） */
export const PERSONAL_PROMPT_CATEGORIES = ["人物", "场景", "风格", "其他"];
export const PERSONAL_PROMPT_UNCATEGORIZED = "其他";

type PersonalPromptStore = {
    prompts: PersonalPrompt[];
    addPrompt: (title: string, prompt: string, category?: string) => PersonalPrompt;
    removePrompt: (id: string) => void;
};

export const usePersonalPromptStore = create<PersonalPromptStore>()(
    persist(
        (set) => ({
            prompts: [],
            addPrompt: (title, prompt, category) => {
                const item: PersonalPrompt = {
                    id: `pp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                    title: title.trim() || prompt.trim().slice(0, 24) || "未命名提示词",
                    prompt: prompt.trim(),
                    category: (category || "").trim() || PERSONAL_PROMPT_UNCATEGORIZED,
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

/** 用户已用过的自定义分类（默认分类之外），供下拉选项合并 */
export function collectCustomCategories(prompts: PersonalPrompt[]): string[] {
    const known = new Set(PERSONAL_PROMPT_CATEGORIES);
    const extra: string[] = [];
    for (const item of prompts) {
        const c = (item.category || "").trim();
        if (c && !known.has(c) && !extra.includes(c)) extra.push(c);
    }
    return extra;
}

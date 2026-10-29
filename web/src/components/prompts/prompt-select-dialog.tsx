import { Search, User } from "lucide-react";
import { type UIEvent, useEffect, useMemo, useState } from "react";
import { App, Empty, Input, Modal, Spin, Tag } from "antd";
import { useTranslation } from "react-i18next";

import { ALL_PROMPTS_OPTION } from "@/services/api/prompts";
import type { Prompt } from "@/services/api/prompts";
import { cn } from "@/lib/utils";
import { usePersonalPromptStore } from "@/stores/use-personal-prompts-store";
import { PromptCard } from "./prompt-card";
import { usePromptList } from "./use-prompt-list";

/** 侧栏「个人」分类：展示本地保存的个人提示词 */
export const PERSONAL_PROMPTS_CATEGORY = "__personal__";

export function PromptSelectDialog({ open, onOpenChange, onSelect }: { open: boolean; onOpenChange: (open: boolean) => void; onSelect: (prompt: string) => void }) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const [keyword, setKeyword] = useState("");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState(ALL_PROMPTS_OPTION);
    const personalPrompts = usePersonalPromptStore((state) => state.prompts);
    // 「个人」分类只过滤本地提示词，画廊查询仍按全部来源查，保证侧栏标签不丢
    const galleryCategory = selectedCategory === PERSONAL_PROMPTS_CATEGORY ? ALL_PROMPTS_OPTION : selectedCategory;
    const { query, items, tags: promptTags, categories: promptCategories } = usePromptList({ keyword, tags: selectedTags, category: galleryCategory, enabled: open });
    const toggleTag = (tag: string) => {
        if (tag === ALL_PROMPTS_OPTION) return setSelectedTags([]);
        setSelectedTags((items) => (items.includes(tag) ? items.filter((item) => item !== tag) : [...items, tag]));
    };
    const selectPrompt = (prompt: string) => {
        onSelect(prompt);
        onOpenChange(false);
    };

    // 个人提示词 → Prompt 形状（无封面，卡片用文案做缩略图）
    const personalItems = useMemo<Prompt[]>(() => {
        const normalizedKeyword = keyword.trim().toLowerCase();
        return personalPrompts
            .filter((item) => {
                if (selectedCategory !== ALL_PROMPTS_OPTION && selectedCategory !== PERSONAL_PROMPTS_CATEGORY) return false;
                if (selectedTags.length && !selectedTags.some((tag) => item.tags.includes(tag))) return false;
                if (!normalizedKeyword) return true;
                return [item.title, item.prompt, ...item.categories, ...item.tags].join(" ").toLowerCase().includes(normalizedKeyword);
            })
            .map((item) => ({
                id: item.id,
                title: item.title,
                prompt: item.prompt,
                description: "",
                coverUrl: "",
                referenceImageUrls: [],
                tags: item.tags.length ? item.tags : item.categories,
                preview: item.prompt.slice(0, 200),
                createdAt: new Date(item.createdAt).toISOString(),
                updatedAt: new Date(item.createdAt).toISOString(),
                sourceId: "personal",
                category: t("prompts.personal"),
                githubUrl: "",
            }));
    }, [keyword, personalPrompts, selectedCategory, selectedTags, t]);

    const displayItems = useMemo(() => (selectedCategory === PERSONAL_PROMPTS_CATEGORY ? personalItems : [...personalItems, ...items]), [items, personalItems, selectedCategory]);

    const sidebarCategories = useMemo(() => [ALL_PROMPTS_OPTION, PERSONAL_PROMPTS_CATEGORY, ...promptCategories.filter((category) => category !== ALL_PROMPTS_OPTION)], [promptCategories]);

    useEffect(() => {
        if (query.isError) message.error(query.error instanceof Error ? query.error.message : t("prompts.loadFailed"));
    }, [message, query.error, query.isError, t]);

    const handleListScroll = (event: UIEvent<HTMLDivElement>) => {
        const target = event.currentTarget;
        if (query.hasNextPage && !query.isFetchingNextPage && target.scrollTop + target.clientHeight >= target.scrollHeight - 160) void query.fetchNextPage();
    };

    return (
        <Modal title={t("prompts.library")} open={open} onCancel={() => onOpenChange(false)} footer={null} width={880} centered>
            <div className="grid h-[62dvh] min-h-0 gap-5 sm:grid-cols-[200px_minmax(0,1fr)]" data-canvas-no-zoom onWheelCapture={(event) => event.stopPropagation()}>
                <aside className="thin-scrollbar min-h-0 overflow-y-auto border-r border-stone-200 pr-4 dark:border-stone-800">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-stone-400 dark:text-stone-500">{t("prompts.category")}</div>
                    <div className="flex flex-wrap gap-1.5">
                        {sidebarCategories.map((category) => {
                            const isPersonal = category === PERSONAL_PROMPTS_CATEGORY;
                            const active = selectedCategory === category;
                            return (
                                <Tag.CheckableTag key={category} checked={active} className={cn("prompt-filter-tag", active && "is-active")} onChange={() => setSelectedCategory(category)}>
                                    <span className="inline-flex items-center gap-1">
                                        {isPersonal ? <User className="size-3" /> : null}
                                        {category === ALL_PROMPTS_OPTION ? t("common.all") : isPersonal ? t("prompts.personal") : category}
                                    </span>
                                </Tag.CheckableTag>
                            );
                        })}
                    </div>
                    <div className="mb-2 mt-5 text-xs font-semibold uppercase tracking-widest text-stone-400 dark:text-stone-500">{t("prompts.tags")}</div>
                    <div className="flex flex-wrap gap-1.5">
                        {promptTags.map((tag) => {
                            const active = tag === ALL_PROMPTS_OPTION ? selectedTags.length === 0 : selectedTags.includes(tag);
                            return (
                                <Tag.CheckableTag key={tag} checked={active} className={cn("prompt-filter-tag", active && "is-active")} onChange={() => toggleTag(tag)}>
                                    {tag === ALL_PROMPTS_OPTION ? t("common.all") : tag}
                                </Tag.CheckableTag>
                            );
                        })}
                    </div>
                </aside>
                <section className="flex min-h-0 min-w-0 flex-col">
                    <Input size="large" prefix={<Search className="size-4 text-stone-400" />} value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder={t("prompts.searchTitle")} />
                    <div className="thin-scrollbar mt-4 min-h-0 flex-1 overflow-y-auto pr-2" data-canvas-no-zoom onScroll={handleListScroll} onWheelCapture={(event) => event.stopPropagation()}>
                        {query.isLoading ? (
                            <div className="flex h-40 items-center justify-center">
                                <Spin />
                            </div>
                        ) : null}
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                            {displayItems.map((item) => (
                                <PromptCard key={item.sourceId === "personal" ? `personal-${item.id}` : item.id} item={item} onOpen={() => selectPrompt(item.prompt)} onCopy={() => selectPrompt(item.prompt)} compact />
                            ))}
                        </div>
                        {!query.isLoading && displayItems.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("prompts.empty")} className="py-8" /> : null}
                        {query.isFetchingNextPage ? (
                            <div className="py-4 text-center">
                                <Spin size="small" />
                            </div>
                        ) : null}
                    </div>
                </section>
            </div>
        </Modal>
    );
}

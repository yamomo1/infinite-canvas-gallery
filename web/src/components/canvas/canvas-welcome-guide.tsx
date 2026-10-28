import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Image as ImageIcon, LayoutTemplate, Music2, Send, Sparkles, Video, Wand2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes, type CanvasTheme } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

/**
 * 空画布引导模块：双击/右键提示 + Agent 输入框 + 快捷能力胶囊。
 * 仅在画布为空时显示，发送消息或添加节点后自动消失（由父组件控制 visible）。
 */
export function CanvasWelcomeGuide({
    visible,
    theme: themeProp,
    onSendPrompt,
    onOpenTemplates,
}: {
    visible: boolean;
    theme?: CanvasTheme;
    onSendPrompt: (text: string) => void;
    onOpenTemplates: () => void;
}) {
    const { t } = useTranslation();
    const themeKey = useThemeStore((state) => state.theme);
    const theme = themeProp ?? canvasThemes[themeKey];
    const accent = themeKey === "dark" ? "#f5f5f4" : "#1c1917";
    const accentInk = themeKey === "dark" ? "#1c1917" : "#fbfaf7";
    const [value, setValue] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    // Ctrl + I 聚焦引导输入框
    useEffect(() => {
        if (!visible) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "i") {
                event.preventDefault();
                inputRef.current?.focus();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [visible]);

    const submit = () => {
        const text = value.trim();
        if (!text) return;
        setValue("");
        onSendPrompt(text);
    };

    const chips: { key: string; icon: typeof Video; fill: string }[] = [
        { key: "textToImage", icon: ImageIcon, fill: t("canvas.guide.fill.textToImage") },
        { key: "textToVideo", icon: Video, fill: t("canvas.guide.fill.textToVideo") },
        { key: "music", icon: Music2, fill: t("canvas.guide.fill.music") },
        { key: "agent", icon: Wand2, fill: t("canvas.guide.fill.agent") },
    ];

    return (
        <AnimatePresence>
            {visible ? (
                <motion.div
                    key="welcome-guide"
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    className="pointer-events-none absolute inset-0 z-[64] flex flex-col items-center justify-center gap-4 px-6"
                    data-canvas-no-zoom
                >
                    <div className="pointer-events-auto flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm shadow-lg backdrop-blur" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}>
                        <span className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: accent, color: accentInk }}>
                            <Sparkles className="size-3.5" />
                            {t("canvas.guide.hintAction")}
                        </span>
                        <span className="opacity-80">{t("canvas.guide.hintText")}</span>
                    </div>

                    <div
                        className="pointer-events-auto flex w-full max-w-xl items-center gap-2 rounded-full border py-2 pl-4 pr-2 shadow-xl backdrop-blur transition focus-within:ring-2"
                        style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                    >
                        <Wand2 className="size-4 shrink-0 opacity-60" />
                        <input
                            ref={inputRef}
                            value={value}
                            onChange={(event) => setValue(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    event.preventDefault();
                                    submit();
                                }
                            }}
                            placeholder={t("canvas.guide.inputPlaceholder")}
                            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:opacity-45"
                            style={{ color: theme.node.text }}
                        />
                        <kbd className="hidden shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium opacity-55 sm:block" style={{ borderColor: theme.toolbar.border }}>
                            Ctrl I
                        </kbd>
                        <button
                            type="button"
                            onClick={submit}
                            disabled={!value.trim()}
                            className="grid size-8 shrink-0 place-items-center rounded-full transition disabled:opacity-30"
                            style={{ background: accent, color: accentInk }}
                            aria-label={t("canvas.guide.send")}
                            title={t("canvas.guide.send")}
                        >
                            <Send className="size-3.5" />
                        </button>
                    </div>

                    <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2">
                        {chips.map((chip) => (
                            <button
                                key={chip.key}
                                type="button"
                                onClick={() => {
                                    setValue(chip.fill);
                                    inputRef.current?.focus();
                                }}
                                className="flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium shadow backdrop-blur transition hover:-translate-y-0.5"
                                style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                            >
                                <chip.icon className="size-3.5 opacity-70" />
                                {t(`canvas.guide.chip.${chip.key}`)}
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={onOpenTemplates}
                            className="flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium shadow backdrop-blur transition hover:-translate-y-0.5"
                            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                        >
                            <LayoutTemplate className="size-3.5 opacity-70" />
                            {t("canvas.guide.chip.templates")}
                        </button>
                    </div>
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
}

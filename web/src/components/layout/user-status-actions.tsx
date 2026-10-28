import type { CSSProperties } from "react";
import { useState } from "react";
import { App, Tooltip } from "antd";
import { BookOpen, Cloud, Keyboard, LogOut, Puzzle, Settings2, User } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { GitHubLink } from "@/components/layout/github-link";
import { UserLoginModal } from "@/components/layout/user-login-modal";
import { VersionReleaseModal } from "@/components/layout/version-release-modal";
import { DOCS_URL } from "@/constant/env";
import { changeAppLocale, type AppLocale } from "@/i18n";
import { syncCanvasToCloud } from "@/services/canvas-cloud-sync";
import { cn } from "@/lib/utils";
import { canvasThemes } from "@/lib/canvas-theme";
import { useConfigStore } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";

type UserStatusActionsProps = {
    showConfig?: boolean;
    variant?: "default" | "canvas";
    onOpenShortcuts?: () => void;
    onOpenPlugins?: () => void;
};

export function UserStatusActions({ showConfig = true, variant = "default", onOpenShortcuts, onOpenPlugins }: UserStatusActionsProps) {
    const { i18n, t } = useTranslation();
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const canvasTheme = canvasThemes[theme];
    const naturalIconClass = "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-stone-600 transition-colors hover:bg-black/5 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-white/10 dark:hover:text-white [&_svg]:size-4";
    const iconStyle: CSSProperties | undefined = variant === "canvas" ? { color: canvasTheme.node.text } : undefined;
    const versionStyle = iconStyle;
    const gitHubClassName = "size-7 text-base";
    const gitHubStyle = iconStyle;
    const user = useUserStore((state) => state.user);
    const logout = useUserStore((state) => state.logout);
    const { message } = App.useApp();
    const [loginOpen, setLoginOpen] = useState(false);
    const [syncing, setSyncing] = useState(false);

    const handleCloudSync = async () => {
        if (syncing) return;
        setSyncing(true);
        try {
            const result = await syncCanvasToCloud();
            message.success(t("topNav.user.syncSuccess", { count: result.pulled + result.pushed }));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("topNav.user.syncFailed"));
        } finally {
            setSyncing(false);
        }
    };
    const locale = i18n.resolvedLanguage as AppLocale;
    const nextLocale = locale === "zh-CN" ? "en-US" : "zh-CN";
    const languageLabel = t("topNav.switchLanguage", { language: t(nextLocale === "zh-CN" ? "locale.zhCN" : "locale.enUS") });

    return (
        <div className="inline-flex shrink-0 items-center gap-1">
            {onOpenPlugins ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={onOpenPlugins} aria-label={t("topNav.plugins")} title={t("topNav.plugins")}>
                    <Puzzle className="size-4" />
                </button>
            ) : null}
            <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" className={naturalIconClass} style={iconStyle} aria-label={t("topNav.docs")} title={t("topNav.docs")}>
                <BookOpen className="size-4" />
            </a>
            {showConfig ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={() => openConfigDialog(false)} aria-label={t("navigation.config")} title={t("navigation.config")}>
                    <Settings2 className="size-4" />
                </button>
            ) : null}
            <Tooltip title={languageLabel} mouseEnterDelay={0.2}>
                <button type="button" className={`${naturalIconClass} text-[11px] font-semibold tracking-tight`} style={iconStyle} onClick={() => void changeAppLocale(nextLocale)} aria-label={languageLabel}>
                    {locale === "zh-CN" ? "中" : "EN"}
                </button>
            </Tooltip>
            <AnimatedThemeToggler theme={theme} onThemeChange={setTheme} className={naturalIconClass} style={iconStyle} aria-label={t(theme === "dark" ? "topNav.lightTheme" : "topNav.darkTheme")} title={t(theme === "dark" ? "topNav.lightTheme" : "topNav.darkTheme")} />
            <VersionReleaseModal style={versionStyle} />
            <GitHubLink className={cn("bg-transparent hover:bg-transparent dark:hover:bg-transparent", gitHubClassName)} style={gitHubStyle} />
            {user ? (
                <div className="inline-flex shrink-0 items-center gap-1">
                    <span
                        className="max-w-[8rem] truncate text-[13px] font-medium text-stone-700 dark:text-stone-200"
                        style={iconStyle}
                        title={user.username}
                    >
                        {user.displayName}
                    </span>
                    <Tooltip title={t("topNav.user.syncCloud")}>
                        <button
                            type="button"
                            className={naturalIconClass}
                            style={iconStyle}
                            onClick={() => void handleCloudSync()}
                            disabled={syncing}
                            aria-label={t("topNav.user.syncCloud")}
                        >
                            <Cloud className={cn("size-4", syncing && "animate-pulse")} />
                        </button>
                    </Tooltip>
                    <Tooltip title={t("topNav.user.logout")}>
                        <button
                            type="button"
                            className={naturalIconClass}
                            style={iconStyle}
                            onClick={logout}
                            aria-label={t("topNav.user.logout")}
                        >
                            <LogOut className="size-4" />
                        </button>
                    </Tooltip>
                </div>
            ) : (
                <button
                    type="button"
                    className={`${naturalIconClass} text-[13px] font-semibold`}
                    style={iconStyle}
                    onClick={() => setLoginOpen(true)}
                    aria-label={t("topNav.user.login")}
                    title={t("topNav.user.login")}
                >
                    <User className="size-4" />
                </button>
            )}
            {onOpenShortcuts ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={onOpenShortcuts} aria-label={t("topNav.shortcuts")} title={t("topNav.shortcuts")}>
                    <Keyboard className="size-4" />
                </button>
            ) : null}
            <UserLoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
        </div>
    );
}

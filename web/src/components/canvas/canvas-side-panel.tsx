import { memo, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { App, Empty, Input, Modal, Popconfirm, Select, Spin, Tag } from "antd";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Check, ChevronRight, Download, Eye, FileText, FolderOpen, Globe, Image as ImageIcon, Layers, LayoutGrid, ListChecks, Music2, PanelLeft, Plus, Rows3, Search, Settings2, Square, Trash2, Type, User, Video, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";

import { canvasThemes, type CanvasTheme } from "@/lib/canvas-theme";
import { exportCanvasNodes } from "@/lib/canvas/canvas-export";
import { getNodeDefinition } from "@/lib/canvas/node-registry";
import { cn } from "@/lib/utils";
import { PromptDetailDialog } from "@/pages/prompts/components/prompt-detail-dialog";
import { fetchGalleryMedia, type GalleryMediaItem } from "@/services/api/gallery-media";
import { fetchSourcePrompts, type Prompt } from "@/services/api/prompts";
import { uploadMediaFile } from "@/services/file-storage";
import { previewUrlFor, subscribeImagePreviews, getImagePreviewRevision, uploadImage } from "@/services/image-storage";
import { useAssetStore, type Asset, type AssetKind } from "@/stores/use-asset-store";
import { usePersonalPromptStore } from "@/stores/use-personal-prompts-store";
import { usePromptSourceStore } from "@/stores/use-prompt-source-store";
import { CANVAS_SIDE_PANEL_MAX_WIDTH, CANVAS_SIDE_PANEL_MIN_WIDTH, CANVAS_SIDE_PANEL_MOTION_MS, useCanvasSidePanelStore } from "@/stores/use-canvas-side-panel-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

import type { InsertAssetPayload } from "./asset-picker-modal";

const PANEL_MOTION_SECONDS = CANVAS_SIDE_PANEL_MOTION_MS / 1000;
const PANEL_EASE = [0.22, 1, 0.36, 1] as const;

type Props = {
    nodes: CanvasNodeData[];
    selectedNodeIds: Set<string>;
    onFocusNode: (nodeId: string) => void;
    onPreviewNode: (nodeId: string) => void;
    onHoverNode: (nodeId: string | null) => void;
    onInsertAsset: (payload: InsertAssetPayload) => void;
    /** 胶囊导航「+」：在画布中心弹出节点创建菜单 */
    onAddNodeAtCenter?: () => void;
};

const NODE_TYPE_ICON: Record<string, typeof Square> = {
    [CanvasNodeType.Image]: ImageIcon,
    [CanvasNodeType.Video]: Video,
    [CanvasNodeType.Audio]: Music2,
    [CanvasNodeType.Text]: Type,
    [CanvasNodeType.Config]: Settings2,
    [CanvasNodeType.Group]: Square,
};

const STATUS_COLOR: Record<string, string> = {
    success: "#22c55e",
    loading: "#f59e0b",
    error: "#ef4444",
    idle: "transparent",
};

export function CanvasSidePanel({ nodes, selectedNodeIds, onFocusNode, onPreviewNode, onHoverNode, onInsertAsset, onAddNodeAtCenter }: Props) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const mode = useCanvasSidePanelStore((state) => state.mode);
    const setMode = useCanvasSidePanelStore((state) => state.setMode);
    const tab = useCanvasSidePanelStore((state) => state.tab);
    const setTab = useCanvasSidePanelStore((state) => state.setTab);
    const toggleTab = useCanvasSidePanelStore((state) => state.toggleTab);
    const width = useCanvasSidePanelStore((state) => state.width);
    const panelOpen = useCanvasSidePanelStore((state) => state.panelOpen);
    const panelMounted = useCanvasSidePanelStore((state) => state.panelMounted);
    const panelClosing = useCanvasSidePanelStore((state) => state.panelClosing);
    const setWidth = useCanvasSidePanelStore((state) => state.setWidth);
    const closePanel = useCanvasSidePanelStore((state) => state.closePanel);
    const [resizing, setResizing] = useState(false);

    // 胶囊模式首次使用（从未手动开关过面板）默认只展示 dock，不展开面板
    useEffect(() => {
        if (mode !== "pill") return;
        if (typeof window !== "undefined" && localStorage.getItem("canvas-side-panel-open") === null) closePanel();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode]);

    // 胶囊模式：点击 dock / 面板卡片以外的区域（画布、顶栏等）自动收起面板
    useEffect(() => {
        if (mode !== "pill" || !panelOpen) return;
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            if (!target || target.closest("[data-pill-root]")) return;
            closePanel();
        };
        document.addEventListener("pointerdown", onPointerDown, true);
        return () => document.removeEventListener("pointerdown", onPointerDown, true);
    }, [mode, panelOpen, closePanel]);

    const body = (
        <>
            <div className="flex items-center gap-4 px-4 pt-3.5">
                <TabButton label={t("canvas.sidePanel.canvas")} active={tab === "canvas"} theme={theme} onClick={() => setTab("canvas")} />
                <TabButton label={t("canvas.sidePanel.assets")} active={tab === "assets"} theme={theme} onClick={() => setTab("assets")} />
                <TabButton label={t("canvas.sidePanel.prompts")} active={tab === "prompts"} theme={theme} onClick={() => setTab("prompts")} />
                {mode === "classic" ? (
                    <button
                        type="button"
                        onClick={() => setMode("pill")}
                        className="ml-auto flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium opacity-55 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
                        title={t("canvas.sidePanel.switchPill")}
                        aria-label={t("canvas.sidePanel.switchPill")}
                    >
                        <PanelLeft className="size-3.5" />
                        {t("canvas.sidePanel.switchPill")}
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={closePanel}
                        className="ml-auto grid size-7 shrink-0 place-items-center rounded-md opacity-55 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
                        title={t("canvas.collapsePanel")}
                        aria-label={t("canvas.collapsePanel")}
                    >
                        <X className="size-4" />
                    </button>
                )}
            </div>
            <div className="mt-2 min-h-0 flex-1 overflow-hidden">
                {tab === "canvas" ? (
                    <CanvasNodesTab nodes={nodes} selectedNodeIds={selectedNodeIds} onFocusNode={onFocusNode} onPreviewNode={onPreviewNode} onHoverNode={onHoverNode} theme={theme} />
                ) : tab === "assets" ? (
                    <CanvasAssetsTab onInsert={onInsertAsset} theme={theme} />
                ) : (
                    <CanvasPromptsTab onInsert={onInsertAsset} theme={theme} />
                )}
            </div>
        </>
    );

    if (mode === "pill") {
        return (
            <>
                <div className="pointer-events-none absolute inset-y-0 left-0 z-[70] flex w-16 items-center" data-canvas-no-zoom data-pill-root>
                    <div className="pointer-events-auto flex flex-col items-center gap-1 rounded-full border p-1.5 shadow-xl" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border }}>
                        <DockButton label={t("canvas.pill.newNode")} accent theme={theme} onClick={onAddNodeAtCenter}>
                            <Plus className="size-4" />
                        </DockButton>
                        <DockButton label={t("canvas.sidePanel.canvas")} theme={theme} active={panelOpen && tab === "canvas"} onClick={() => toggleTab("canvas")}>
                            <Layers className="size-4" />
                        </DockButton>
                        <DockButton label={t("canvas.sidePanel.assets")} theme={theme} active={panelOpen && tab === "assets"} onClick={() => toggleTab("assets")}>
                            <FolderOpen className="size-4" />
                        </DockButton>
                        <DockButton label={t("canvas.sidePanel.prompts")} theme={theme} active={panelOpen && tab === "prompts"} onClick={() => toggleTab("prompts")}>
                            <BookOpen className="size-4" />
                        </DockButton>
                        <span className="my-0.5 h-px w-6 shrink-0" style={{ background: theme.toolbar.border }} />
                        <DockButton label={t("canvas.sidePanel.switchClassic")} theme={theme} onClick={() => setMode("classic")}>
                            <PanelLeft className="size-4" />
                        </DockButton>
                    </div>
                </div>
                <AnimatePresence>
                    {panelMounted ? (
                        <motion.div
                            key="pill-panel"
                            className="pointer-events-none absolute inset-y-0 left-16 z-[65] flex items-center"
                            data-pill-root
                            initial={{ opacity: 0, x: -16 }}
                            animate={{ opacity: panelOpen ? 1 : 0, x: panelClosing ? -12 : 0 }}
                            exit={{ opacity: 0, x: -16 }}
                            transition={{ duration: resizing ? 0 : PANEL_MOTION_SECONDS, ease: PANEL_EASE }}
                        >
                            <div
                                className="pointer-events-auto relative flex flex-col overflow-hidden rounded-2xl border shadow-2xl"
                                style={{ width, height: "min(640px, calc(100% - 6rem))", background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                                data-canvas-no-zoom
                            >
                                {body}
                                <button type="button" className="absolute inset-y-0 right-0 z-40 w-3 translate-x-1/2 cursor-col-resize" onPointerDown={(event) => beginResize(event, width, setWidth, setResizing)} aria-label={t("canvas.sidePanel.resize")} />
                            </div>
                        </motion.div>
                    ) : null}
                </AnimatePresence>
            </>
        );
    }

    if (!panelMounted) return null;

    return (
        <motion.div
            className="relative z-[60] flex h-full shrink-0"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: panelOpen ? width + 1 : 0, opacity: panelOpen ? 1 : 0 }}
            transition={{ duration: resizing ? 0 : PANEL_MOTION_SECONDS, ease: PANEL_EASE }}
            style={{ overflow: "clip", pointerEvents: panelClosing ? "none" : undefined }}
        >
            <motion.aside
                className="relative flex h-full shrink-0 flex-col overflow-hidden border-r"
                initial={{ x: -48 }}
                animate={{ x: panelClosing ? -28 : 0 }}
                transition={{ duration: resizing ? 0 : PANEL_MOTION_SECONDS, ease: PANEL_EASE }}
                style={{ width, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                data-canvas-no-zoom
            >
                {body}
                <button type="button" className="absolute inset-y-0 right-0 z-40 w-4 translate-x-1/2 cursor-col-resize" onPointerDown={(event) => beginResize(event, width, setWidth, setResizing)} aria-label={t("canvas.sidePanel.resize")} />
            </motion.aside>
        </motion.div>
    );
}

function beginResize(event: ReactPointerEvent<HTMLButtonElement>, width: number, setWidth: (width: number) => void, setResizing: (value: boolean) => void) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    let nextWidth = startWidth;
    const onMove = (moveEvent: PointerEvent) => {
        nextWidth = Math.min(CANVAS_SIDE_PANEL_MAX_WIDTH, Math.max(CANVAS_SIDE_PANEL_MIN_WIDTH, startWidth + moveEvent.clientX - startX));
        setWidth(nextWidth);
    };
    const onUp = () => {
        localStorage.setItem("canvas-side-panel-width", String(nextWidth));
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        setResizing(false);
    };
    setResizing(true);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
}

function DockButton({ label, children, active, accent, theme, onClick }: { label: string; children: ReactNode; active?: boolean; accent?: boolean; theme: CanvasTheme; onClick?: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={label}
            aria-label={label}
            className={cn("grid size-9 shrink-0 place-items-center rounded-full transition duration-150", accent || active ? "" : "opacity-70 hover:opacity-100")}
            style={{
                background: accent ? theme.toolbar.activeText : active ? theme.toolbar.activeBg : "transparent",
                color: accent ? theme.toolbar.panel : active ? theme.toolbar.activeText : theme.node.text,
            }}
        >
            {children}
        </button>
    );
}

function TabButton({ label, active, theme, onClick }: { label: string; active: boolean; theme: CanvasTheme; onClick: () => void }) {
    return (
        <button type="button" onClick={onClick} className="relative pb-1.5 text-sm font-semibold transition-opacity" style={{ color: theme.node.text, opacity: active ? 1 : 0.45 }}>
            {label}
            {active ? <motion.span layoutId="sidePanelTabIndicator" className="absolute inset-x-0 -bottom-px h-0.5 rounded-full" style={{ background: theme.toolbar.activeText }} transition={{ type: "spring", stiffness: 500, damping: 34 }} /> : null}
        </button>
    );
}

// ---------------------------------------------------------------------------
// Canvas tab: list nodes and center, zoom, and select the clicked node.
// ---------------------------------------------------------------------------

const NODE_FILTER_VALUES = ["all", CanvasNodeType.Image, CanvasNodeType.Video, CanvasNodeType.Text, CanvasNodeType.Audio, CanvasNodeType.Config, CanvasNodeType.Group];

function nodePreviewText(node: CanvasNodeData) {
    if (node.type === CanvasNodeType.Text) return node.metadata?.content || node.metadata?.prompt || "";
    return getNodeDefinition(node.type)?.title || node.type;
}

function CanvasNodesTab({ nodes, selectedNodeIds, onFocusNode, onPreviewNode, onHoverNode, theme }: { nodes: CanvasNodeData[]; selectedNodeIds: Set<string>; onFocusNode: (nodeId: string) => void; onPreviewNode: (nodeId: string) => void; onHoverNode: (nodeId: string | null) => void; theme: CanvasTheme }) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const [keyword, setKeyword] = useState("");
    const [typeFilter, setTypeFilter] = useState<string>("all");
    const [selectMode, setSelectMode] = useState(false);
    const [checked, setChecked] = useState<Set<string>>(new Set());
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
    const [exporting, setExporting] = useState(false);
    const nodeViewMode = useCanvasSidePanelStore((state) => state.nodeViewMode);
    const setNodeViewMode = useCanvasSidePanelStore((state) => state.setNodeViewMode);

    const filtered = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return nodes.filter((node) => (typeFilter === "all" || node.type === typeFilter) && (!query || [node.title, node.metadata?.content, node.metadata?.prompt].filter(Boolean).join(" ").toLowerCase().includes(query)));
    }, [nodes, keyword, typeFilter]);
    const treeRows = useMemo(() => {
        const filteredIds = new Set(filtered.map((node) => node.id));
        const groups = new Set(nodes.filter((node) => node.type === CanvasNodeType.Group).map((node) => node.id));
        const children = new Map<string, CanvasNodeData[]>();
        filtered.forEach((node) => {
            const groupId = node.metadata?.groupId;
            if (groupId && groups.has(groupId)) children.set(groupId, [...(children.get(groupId) || []), node]);
        });
        return nodes.flatMap((node) => {
            if (node.metadata?.groupId && groups.has(node.metadata.groupId)) return [];
            if (node.type !== CanvasNodeType.Group) return filteredIds.has(node.id) ? [{ node, depth: 0, hasChildren: false }] : [];
            const groupChildren = children.get(node.id) || [];
            if (!filteredIds.has(node.id) && !groupChildren.length) return [];
            return [{ node, depth: 0, hasChildren: groupChildren.length > 0 }, ...(collapsedGroups.has(node.id) ? [] : groupChildren.map((child) => ({ node: child, depth: 1, hasChildren: false })))];
        });
    }, [collapsedGroups, filtered, nodes]);

    const exitSelect = () => {
        setSelectMode(false);
        setChecked(new Set());
    };
    const toggleChecked = (id: string) =>
        setChecked((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    const allChecked = filtered.length > 0 && filtered.every((node) => checked.has(node.id));
    const toggleAll = () => setChecked(allChecked ? new Set() : new Set(filtered.map((node) => node.id)));

    // Let the hover preview fade out before the canvas starts moving to the node.
    const PRESS_FOCUS_DELAY = 180;
    const focusTimerRef = useRef<number | null>(null);
    useEffect(() => () => { if (focusTimerRef.current !== null) window.clearTimeout(focusTimerRef.current); }, []);
    const activateNode = (node: CanvasNodeData) => {
        if (focusTimerRef.current !== null) window.clearTimeout(focusTimerRef.current);
        focusTimerRef.current = null;
        const hasPreview = (node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video) && Boolean(node.metadata?.content);
        if (!hasPreview) {
            onFocusNode(node.id);
            return;
        }
        onHoverNode(null);
        focusTimerRef.current = window.setTimeout(() => {
            focusTimerRef.current = null;
            onFocusNode(node.id);
        }, PRESS_FOCUS_DELAY);
    };

    const handleExport = async () => {
        const targets = nodes.filter((node) => checked.has(node.id));
        if (!targets.length) return;
        setExporting(true);
        const hide = message.loading(t("canvas.sidePanel.exporting"), 0);
        try {
            await exportCanvasNodes(targets, t("canvas.sidePanel.exportName", { count: targets.length }));
            message.success(t("canvas.sidePanel.exported", { count: targets.length }));
            exitSelect();
        } catch (error) {
            console.error(error);
            message.error(t("canvas.sidePanel.exportFailed"));
        } finally {
            hide();
            setExporting(false);
        }
    };

    return (
        <div className="flex h-full flex-col" onMouseLeave={() => onHoverNode(null)}>
            <div className="flex items-center gap-2 px-3 pb-2.5 pt-1">
                <span className="min-w-0 truncate text-xs font-medium opacity-60">{t("canvas.sidePanel.elements")}</span>
                {filtered.length ? <span className="shrink-0 text-xs opacity-35">{filtered.length}</span> : null}
                <button
                    type="button"
                    onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
                    className="ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1 text-xs font-medium opacity-70 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
                    style={selectMode ? { color: theme.toolbar.activeText, opacity: 1 } : undefined}
                >
                    <ListChecks className="size-3.5" />
                    {selectMode ? t("common.cancel") : t("canvas.sidePanel.select")}
                </button>
                {selectMode ? null : <Select size="small" variant="borderless" className="w-20" value={typeFilter} onChange={setTypeFilter} options={NODE_FILTER_VALUES.map((value) => ({ value, label: value === "all" ? t("common.all") : t(`canvas.sidePanel.filter.${value}`) }))} />}
                <button
                    type="button"
                    onClick={() => setNodeViewMode(nodeViewMode === "grid" ? "list" : "grid")}
                    className="flex shrink-0 items-center rounded-md px-1.5 py-1 opacity-70 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
                    title={nodeViewMode === "grid" ? t("canvas.sidePanel.viewList") : t("canvas.sidePanel.viewGrid")}
                    aria-label={nodeViewMode === "grid" ? t("canvas.sidePanel.viewList") : t("canvas.sidePanel.viewGrid")}
                >
                    {nodeViewMode === "grid" ? <Rows3 className="size-3.5" /> : <LayoutGrid className="size-3.5" />}
                </button>
            </div>
            <div className="px-3 pb-2.5">
                <Input size="small" allowClear prefix={<Search className="size-3.5 text-stone-400" />} placeholder={t("canvas.sidePanel.searchNodes")} value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                {nodeViewMode === "grid" ? (
                    filtered.length ? (
                        <div className="grid gap-2 px-1 [grid-template-columns:repeat(auto-fill,minmax(88px,1fr))]">
                            {filtered.map((node) => {
                                const Icon = NODE_TYPE_ICON[node.type] || FileText;
                                const isImage = node.type === CanvasNodeType.Image && node.metadata?.content;
                                const isChecked = checked.has(node.id);
                                const active = selectMode ? isChecked : selectedNodeIds.has(node.id);
                                return (
                                    <button
                                        key={node.id}
                                        type="button"
                                        data-node-item
                                        onClick={() => (selectMode ? toggleChecked(node.id) : activateNode(node))}
                                        onMouseEnter={() => onHoverNode(node.id)}
                                        onMouseLeave={(event) => {
                                            const to = event.relatedTarget as Element | null;
                                            if (!to || !to.closest("[data-node-item]")) onHoverNode(null);
                                        }}
                                        className="group relative flex min-w-0 flex-col rounded-lg p-1 text-left transition hover:bg-black/5 dark:hover:bg-white/5"
                                        style={active ? { background: theme.toolbar.activeBg } : undefined}
                                        title={selectMode ? undefined : t("canvas.sidePanel.focusNode")}
                                    >
                                        <span className="relative grid aspect-square w-full place-items-center overflow-hidden rounded-md">
                                            {isImage ? <img src={previewUrlFor(node.metadata?.storageKey) || node.metadata?.content} alt={node.title} className="size-full object-cover" /> : <Icon className="size-6 opacity-60" />}
                                            {selectMode ? (
                                                <span className="absolute left-1 top-1">
                                                    <CheckMark checked={isChecked} theme={theme} />
                                                </span>
                                            ) : null}
                                            {node.metadata?.status && node.metadata.status !== "idle" ? <span className="absolute right-1 top-1 size-1.5 rounded-full" style={{ background: STATUS_COLOR[node.metadata.status] || "transparent" }} /> : null}
                                        </span>
                                        <span className="mt-1 block truncate text-xs font-medium leading-snug">{node.title || getNodeDefinition(node.type)?.title || t("canvas.node.untitled")}</span>
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="pt-16 text-center text-sm opacity-40">{t("canvas.sidePanel.noNodes")}</div>
                    )
                ) : treeRows.length ? (
                    <div className="space-y-1.5">
                        {treeRows.map(({ node, depth, hasChildren }) => {
                            const Icon = NODE_TYPE_ICON[node.type] || FileText;
                            const isImage = node.type === CanvasNodeType.Image && node.metadata?.content;
                            const isChecked = checked.has(node.id);
                            const active = selectMode ? isChecked : selectedNodeIds.has(node.id);
                            return (
                                <div
                                    key={node.id}
                                    data-node-item
                                    className={cn("group relative flex items-center rounded-lg transition", depth && "ml-5", active ? "" : "hover:bg-black/5 dark:hover:bg-white/5")}
                                    style={active ? { background: theme.toolbar.activeBg } : undefined}
                                    onMouseEnter={() => onHoverNode(node.id)}
                                    onMouseLeave={(event) => {
                                        const to = event.relatedTarget as Element | null;
                                        if (!to || !to.closest("[data-node-item]")) onHoverNode(null);
                                    }}
                                >
                                    {depth ? <span className="pointer-events-none absolute -left-3 top-[calc(-50%-0.4rem)] h-[calc(100%+0.4rem)] w-3 rounded-bl-md border-b border-l opacity-45" style={{ borderColor: theme.node.stroke }} /> : null}
                                    {node.type === CanvasNodeType.Group && hasChildren ? (
                                        <button type="button" onClick={() => setCollapsedGroups((prev) => (prev.has(node.id) ? new Set([...prev].filter((id) => id !== node.id)) : new Set(prev).add(node.id)))} className="ml-1 grid size-6 shrink-0 place-items-center opacity-55 transition hover:opacity-100" aria-label={node.title}>
                                            <ChevronRight className={cn("size-3.5 transition-transform", !collapsedGroups.has(node.id) && "rotate-90")} />
                                        </button>
                                    ) : null}
                                    <button type="button" onClick={() => (selectMode ? toggleChecked(node.id) : activateNode(node))} className={cn("flex min-w-0 flex-1 items-center gap-3 py-2 pr-2 text-left", node.type === CanvasNodeType.Group && hasChildren ? "pl-0" : "pl-2")} title={selectMode ? undefined : t("canvas.sidePanel.focusNode")}>
                                        {selectMode ? <CheckMark checked={isChecked} theme={theme} /> : null}
                                        <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md">
                                            {isImage ? <img src={previewUrlFor(node.metadata?.storageKey) || node.metadata?.content} alt={node.title} className="size-full object-cover" /> : <Icon className="size-5 opacity-60" />}
                                        </span>
                                        <span className="min-w-0 flex-1 space-y-0.5">
                                            <span className="block truncate text-sm font-medium leading-snug">{node.title || getNodeDefinition(node.type)?.title || t("canvas.node.untitled")}</span>
                                            <span className="block truncate text-xs leading-snug opacity-50">{nodePreviewText(node)}</span>
                                        </span>
                                        {node.metadata?.status && node.metadata.status !== "idle" ? <span className="size-1.5 shrink-0 rounded-full" style={{ background: STATUS_COLOR[node.metadata.status] || "transparent" }} /> : null}
                                    </button>
                                    {selectMode || !isImage ? null : (
                                        <div className="flex shrink-0 flex-col items-center gap-0.5 pr-1.5">
                                            <button type="button" onClick={() => onPreviewNode(node.id)} className="grid size-7 place-items-center rounded-md opacity-55 transition hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10" aria-label={t("canvas.sidePanel.preview")} title={t("canvas.sidePanel.preview")}>
                                                <Eye className="size-3.5" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="pt-16 text-center text-sm opacity-40">{t("canvas.sidePanel.noNodes")}</div>
                )}
            </div>
            {selectMode ? (
                <div className="flex items-center gap-2 border-t px-3 py-2.5" style={{ borderColor: theme.toolbar.border }}>
                    <button type="button" onClick={toggleAll} className="rounded-md px-2 py-1 text-xs font-medium opacity-70 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10">
                        {allChecked ? t("canvas.sidePanel.clearAll") : t("workbench.selectAll")}
                    </button>
                    <span className="text-xs opacity-45">{t("canvas.sidePanel.selected", { count: checked.size })}</span>
                    <button
                        type="button"
                        onClick={() => void handleExport()}
                        disabled={!checked.size || exporting}
                        className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/10"
                        style={{ color: theme.node.text }}
                    >
                        <Download className="size-3.5" />
                        {t("canvas.exportSelected")}
                    </button>
                </div>
            ) : null}
        </div>
    );
}

function CheckMark({ checked, theme }: { checked: boolean; theme: CanvasTheme }) {
    return (
        <span className="grid size-4 shrink-0 place-items-center rounded border transition" style={{ borderColor: checked ? theme.toolbar.activeText : theme.node.stroke, background: checked ? theme.toolbar.activeText : "transparent" }}>
            {checked ? <Check className="size-3 text-white" /> : null}
        </span>
    );
}

// ---------------------------------------------------------------------------
// Assets tab: collapsible type groups, tag filtering, and click-to-insert.
// ---------------------------------------------------------------------------

const ASSET_GROUPS: { kind: AssetKind; icon: typeof Square }[] = [
    { kind: "image", icon: ImageIcon },
    { kind: "video", icon: Video },
    { kind: "text", icon: FileText },
];

function buildInsertPayload(asset: Asset): InsertAssetPayload {
    if (asset.kind === "text") return { kind: "text", content: asset.data.content, title: asset.title };
    if (asset.kind === "video") return { kind: "video", url: asset.data.url, storageKey: asset.data.storageKey, title: asset.title, width: asset.data.width, height: asset.data.height };
    return { kind: "image", dataUrl: asset.data.dataUrl, storageKey: asset.data.storageKey, title: asset.title };
}

const CanvasAssetsTab = memo(function CanvasAssetsTab({ onInsert, theme }: { onInsert: (payload: InsertAssetPayload) => void; theme: CanvasTheme }) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const assets = useAssetStore((state) => state.assets);
    const addAsset = useAssetStore((state) => state.addAsset);
    const removeAsset = useAssetStore((state) => state.removeAsset);
    const [keyword, setKeyword] = useState("");
    const [tagFilter, setTagFilter] = useState<string>("all");
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const allTags = useMemo(() => Array.from(new Set(assets.flatMap((asset) => asset.tags || []))).slice(0, 20), [assets]);

    const filtered = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return assets.filter((asset) => (tagFilter === "all" || (asset.tags || []).includes(tagFilter)) && (!query || [asset.title, ...(asset.tags || [])].join(" ").toLowerCase().includes(query)));
    }, [assets, keyword, tagFilter]);

    const groups = useMemo(() => ASSET_GROUPS.map((group) => ({ ...group, items: filtered.filter((asset) => asset.kind === group.kind) })).filter((group) => group.items.length > 0), [filtered]);

    // 画廊素材：New API 提示词画廊收录的图片/视频作品，点击直接插入画布
    const galleryQuery = useQuery({ queryKey: ["canvas-gallery-media"], queryFn: () => fetchGalleryMedia(100), staleTime: 1000 * 60 * 10, refetchOnWindowFocus: false, retry: 1 });
    const [galleryCollapsed, setGalleryCollapsed] = useState(false);
    const galleryItems = galleryQuery.data || [];

    const insertGalleryMedia = async (item: GalleryMediaItem) => {
        if (item.type === "video") {
            onInsert({ kind: "video", url: item.url, title: item.title });
            return;
        }
        try {
            const response = await fetch(item.url, { mode: "cors" });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            const file = new File([blob], `${item.title || "gallery"}.png`, { type: blob.type || "image/png" });
            const image = await uploadImage(file);
            onInsert({ kind: "image", dataUrl: image.url, storageKey: image.storageKey, title: item.title });
        } catch {
            // 拉取失败（跨域等）退化为直接引用远端 URL
            onInsert({ kind: "image", dataUrl: item.url, title: item.title });
        }
    };

    const handleFiles = async (fileList: FileList | null) => {
        const files = Array.from(fileList || []);
        if (!files.length) return;
        setUploading(true);
        const hide = message.loading(t("canvas.sidePanel.addingAssets"), 0);
        let added = 0;
        try {
            for (const file of files) {
                if (file.type.startsWith("image/")) {
                    const image = await uploadImage(file);
                    addAsset({ kind: "image", title: file.name || t("assets.kinds.image"), coverUrl: image.url, tags: [], data: { dataUrl: image.url, storageKey: image.storageKey, width: image.width, height: image.height, bytes: image.bytes, mimeType: image.mimeType } });
                    added += 1;
                } else if (file.type.startsWith("video/")) {
                    const media = await uploadMediaFile(file, "video");
                    addAsset({ kind: "video", title: file.name || t("assets.kinds.video"), coverUrl: "", tags: [], data: { url: media.url, storageKey: media.storageKey, width: media.width || 0, height: media.height || 0, bytes: media.bytes, mimeType: media.mimeType } });
                    added += 1;
                }
            }
            if (added) message.success(t("canvas.sidePanel.addedAssets", { count: added }));
            else message.warning(t("canvas.sidePanel.mediaOnly"));
        } catch (error) {
            console.error(error);
            message.error(t("canvas.sidePanel.addFailed"));
        } finally {
            hide();
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    return (
        <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 px-3 pb-2 pt-1">
                <Input size="small" allowClear prefix={<Search className="size-3.5 text-stone-400" />} placeholder={t("canvas.sidePanel.searchAssets")} value={keyword} onChange={(e) => setKeyword(e.target.value)} />
                <button
                    type="button"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/10"
                    style={{ color: theme.node.text }}
                >
                    <Plus className="size-3.5" />
                    {t("canvas.sidePanel.add")}
                </button>
                <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => void handleFiles(e.target.files)} />
            </div>
            {allTags.length ? (
                <div className="flex flex-wrap gap-1.5 px-3 pb-2">
                    <Tag.CheckableTag checked={tagFilter === "all"} className={cn("prompt-filter-tag", tagFilter === "all" && "is-active")} onChange={() => setTagFilter("all")}>
                        {t("common.all")}
                    </Tag.CheckableTag>
                    {allTags.map((tag) => (
                        <Tag.CheckableTag key={tag} checked={tagFilter === tag} className={cn("prompt-filter-tag", tagFilter === tag && "is-active")} onChange={() => setTagFilter((prev) => (prev === tag ? "all" : tag))}>
                            {tag}
                        </Tag.CheckableTag>
                    ))}
                </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                <button
                    type="button"
                    onClick={() => setGalleryCollapsed((prev) => !prev)}
                    className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-xs font-semibold opacity-75 transition hover:opacity-100"
                >
                    <ChevronRight className={cn("size-3.5 transition-transform", !galleryCollapsed && "rotate-90")} />
                    <Globe className="size-3.5" />
                    <span>{t("canvas.sidePanel.galleryAssets")}</span>
                    {galleryItems.length ? <span className="opacity-50">{galleryItems.length}</span> : null}
                </button>
                {galleryCollapsed ? null : (
                    <div className="px-1 pb-2 pt-1">
                        {galleryQuery.isLoading ? (
                            <div className="flex justify-center py-4">
                                <Spin size="small" />
                            </div>
                        ) : galleryQuery.isError ? (
                            <button type="button" onClick={() => void galleryQuery.refetch()} className="block w-full py-3 text-center text-xs text-red-500 opacity-80 transition hover:opacity-100">
                                {t("canvas.sidePanel.loadFailedRetry")}
                            </button>
                        ) : galleryItems.length ? (
                            <div className="grid grid-cols-2 gap-2">
                                {galleryItems.map((item) => (
                                    <GalleryMediaCard key={item.key} item={item} theme={theme} onInsert={() => void insertGalleryMedia(item)} />
                                ))}
                            </div>
                        ) : (
                            <div className="py-3 text-center text-xs opacity-40">{t("canvas.sidePanel.noGalleryAssets")}</div>
                        )}
                    </div>
                )}
                {groups.length ? (
                    <div className="space-y-1">
                        {groups.map((group) => {
                            const isCollapsed = collapsed[group.kind];
                            return (
                                <div key={group.kind}>
                                    <button
                                        type="button"
                                        onClick={() => setCollapsed((prev) => ({ ...prev, [group.kind]: !prev[group.kind] }))}
                                        className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-xs font-semibold opacity-75 transition hover:opacity-100"
                                    >
                                        <ChevronRight className={cn("size-3.5 transition-transform", !isCollapsed && "rotate-90")} />
                                        <group.icon className="size-3.5" />
                                        <span>{t(`assets.kinds.${group.kind}`)}</span>
                                        <span className="opacity-50">{group.items.length}</span>
                                    </button>
                                    {isCollapsed ? null : (
                                        <div className="grid grid-cols-2 gap-2 px-1 pb-2 pt-1">
                                            {group.items.map((asset) => (
                                                <AssetCard key={asset.id} asset={asset} theme={theme} onInsert={() => onInsert(buildInsertPayload(asset))} onRemove={() => (removeAsset(asset.id), message.success(t("canvas.sidePanel.assetRemoved")))} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("canvas.sidePanel.noAssets")} className="pt-16" />
                )}
            </div>
        </div>
    );
});

function AssetCard({ asset, theme, onInsert, onRemove }: { asset: Asset; theme: CanvasTheme; onInsert: () => void; onRemove: () => void }) {
    const { t } = useTranslation();
    return (
        <div className="group relative aspect-square overflow-hidden rounded-xl border transition duration-200 hover:-translate-y-0.5 hover:shadow-lg" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
            <AssetCover asset={asset} />
            <div className="absolute inset-0 flex items-center justify-center gap-2.5 opacity-0 transition duration-200 group-hover:opacity-100">
                <button
                    type="button"
                    onClick={onInsert}
                    className="grid size-8 place-items-center rounded-full bg-white/90 text-stone-700 shadow-sm backdrop-blur transition hover:bg-white hover:text-stone-900 dark:bg-black/60 dark:text-stone-100 dark:hover:bg-black/80"
                    aria-label={t("canvas.sidePanel.inserted")}
                >
                    <Plus className="size-4" />
                </button>
                <Popconfirm title={t("canvas.sidePanel.removeAssetTitle")} okText={t("canvas.sidePanel.remove")} cancelText={t("common.cancel")} okButtonProps={{ danger: true }} onConfirm={onRemove}>
                    <button
                        type="button"
                        className="grid size-8 place-items-center rounded-full bg-white/90 text-stone-700 shadow-sm backdrop-blur transition hover:bg-white hover:text-red-500 dark:bg-black/60 dark:text-stone-100 dark:hover:bg-black/80 dark:hover:text-red-400"
                        aria-label={t("canvas.sidePanel.removeAsset")}
                    >
                        <Trash2 className="size-4" />
                    </button>
                </Popconfirm>
            </div>
        </div>
    );
}

function GalleryMediaCard({ item, theme, onInsert }: { item: GalleryMediaItem; theme: CanvasTheme; onInsert: () => void }) {
    const { t } = useTranslation();
    return (
        <div className="group relative aspect-square overflow-hidden rounded-xl border transition duration-200 hover:-translate-y-0.5 hover:shadow-lg" style={{ borderColor: theme.node.stroke, background: theme.node.panel }} title={item.title}>
            {item.type === "video" ? (
                <video src={`${item.url}#t=0.1`} muted playsInline preload="metadata" className="size-full object-cover" />
            ) : (
                <img src={item.url} alt={item.title} loading="lazy" className="size-full object-cover transition duration-300 group-hover:scale-[1.04]" />
            )}
            <span className="absolute left-1.5 top-1.5 rounded bg-black/55 px-1 py-0.5 text-[10px] font-medium text-white opacity-0 transition group-hover:opacity-100">{item.type === "video" ? t("assets.kinds.video") : t("assets.kinds.image")}</span>
            <div className="absolute inset-0 flex items-center justify-center opacity-0 transition duration-200 group-hover:opacity-100">
                <button
                    type="button"
                    onClick={onInsert}
                    className="grid size-8 place-items-center rounded-full bg-white/90 text-stone-700 shadow-sm backdrop-blur transition hover:bg-white hover:text-stone-900 dark:bg-black/60 dark:text-stone-100 dark:hover:bg-black/80"
                    aria-label={t("canvas.sidePanel.inserted")}
                >
                    <Plus className="size-4" />
                </button>
            </div>
        </div>
    );
}

function AssetCover({ asset }: { asset: Asset }) {
    if (asset.kind === "text") return <div className="size-full overflow-hidden whitespace-pre-wrap break-words p-2.5 text-[11px] leading-snug opacity-80">{asset.data.content}</div>;
    if (asset.kind === "video") {
        if (asset.coverUrl) return <img src={asset.coverUrl} alt="" className="size-full object-cover transition duration-300 group-hover:scale-[1.04]" />;
        return <video src={`${asset.data.url}#t=0.1`} muted playsInline preload="metadata" className="size-full object-cover transition duration-300 group-hover:scale-[1.04]" />;
    }
    return <img src={asset.coverUrl || asset.data.dataUrl} alt="" className="size-full object-cover transition duration-300 group-hover:scale-[1.04]" />;
}

// ---------------------------------------------------------------------------
// Prompt library tab: collapsible source groups, lazy loading, and copy or text-node insertion actions.
// ---------------------------------------------------------------------------

const CanvasPromptsTab = memo(function CanvasPromptsTab({ onInsert, theme }: { onInsert: (payload: InsertAssetPayload) => void; theme: CanvasTheme }) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const sources = usePromptSourceStore((state) => state.sources);
    const enabledSources = useMemo(() => sources.filter((source) => source.enabled), [sources]);
    const personalPrompts = usePersonalPromptStore((state) => state.prompts);
    const addPersonalPrompt = usePersonalPromptStore((state) => state.addPrompt);
    const removePersonalPrompt = usePersonalPromptStore((state) => state.removePrompt);
    const [keyword, setKeyword] = useState("");
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [personalExpanded, setPersonalExpanded] = useState(true);
    const [adding, setAdding] = useState(false);
    const [draftTitle, setDraftTitle] = useState("");
    const [draftPrompt, setDraftPrompt] = useState("");
    const [detail, setDetail] = useState<Prompt | null>(null);
    const copyPrompt = async (prompt: string) => {
        try {
            await navigator.clipboard.writeText(prompt);
            message.success(t("canvas.sidePanel.promptCopied"));
        } catch {
            message.error(t("canvas.sidePanel.copyFailed"));
        }
    };

    const filteredPersonal = useMemo(() => {
        const q = keyword.trim().toLowerCase();
        if (!q) return personalPrompts;
        return personalPrompts.filter((item) => [item.title, item.prompt].join(" ").toLowerCase().includes(q));
    }, [keyword, personalPrompts]);

    const submitPersonal = () => {
        if (!draftPrompt.trim()) {
            message.warning(t("canvas.sidePanel.promptRequired"));
            return;
        }
        addPersonalPrompt(draftTitle, draftPrompt);
        setDraftTitle("");
        setDraftPrompt("");
        setAdding(false);
        message.success(t("canvas.sidePanel.promptAdded"));
    };

    return (
        <div className="flex h-full flex-col">
            <div className="px-3 pb-2.5 pt-1">
                <Input size="small" allowClear prefix={<Search className="size-3.5 text-stone-400" />} placeholder={t("canvas.sidePanel.searchPrompts")} value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                <div className="space-y-1">
                    <button type="button" onClick={() => setPersonalExpanded((prev) => !prev)} className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-xs font-semibold opacity-75 transition hover:opacity-100">
                        <ChevronRight className={cn("size-3.5 transition-transform", personalExpanded && "rotate-90")} />
                        <User className="size-3.5" />
                        <span className="min-w-0 flex-1 truncate">{t("canvas.sidePanel.personalPrompts")}</span>
                        {personalPrompts.length ? <span className="opacity-50">{filteredPersonal.length}</span> : null}
                        {personalExpanded ? (
                            <span
                                role="button"
                                tabIndex={0}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setAdding(true);
                                }}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                        event.stopPropagation();
                                        setAdding(true);
                                    }
                                }}
                                className="grid size-5 place-items-center rounded transition hover:bg-black/10 dark:hover:bg-white/10"
                                title={t("canvas.sidePanel.addPrompt")}
                                aria-label={t("canvas.sidePanel.addPrompt")}
                            >
                                <Plus className="size-3.5" />
                            </span>
                        ) : null}
                    </button>
                    {personalExpanded ? (
                        <div className="px-1 pb-2 pt-1">
                            {filteredPersonal.length ? (
                                <div className="space-y-1.5">
                                    {filteredPersonal.map((item) => (
                                        <div key={item.id} className="group relative flex items-center gap-2.5 rounded-lg px-2 py-2 transition hover:bg-black/5 dark:hover:bg-white/5">
                                            <span className="grid size-10 shrink-0 place-items-center rounded-md" style={{ background: theme.node.panel }}>
                                                <User className="size-4 opacity-50" />
                                            </span>
                                            <button type="button" onClick={() => onInsert({ kind: "text", content: item.prompt, title: item.title })} className="min-w-0 flex-1 text-left">
                                                <div className="truncate text-sm font-medium leading-snug">{item.title}</div>
                                                <div className="mt-0.5 truncate text-xs leading-snug opacity-50">{item.prompt}</div>
                                            </button>
                                            <div className="flex shrink-0 flex-col items-center gap-0.5">
                                                <button type="button" onClick={() => onInsert({ kind: "text", content: item.prompt, title: item.title })} className="grid size-6 place-items-center rounded-md opacity-60 transition hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10" style={{ color: theme.toolbar.activeText }} aria-label={t("canvas.sidePanel.inserted")} title={t("canvas.sidePanel.inserted")}>
                                                    <Plus className="size-3.5" />
                                                </button>
                                                <Popconfirm title={t("canvas.sidePanel.removePromptTitle")} okText={t("canvas.sidePanel.remove")} cancelText={t("common.cancel")} okButtonProps={{ danger: true }} onConfirm={() => (removePersonalPrompt(item.id), message.success(t("canvas.sidePanel.promptRemoved")))}>
                                                    <button type="button" className="grid size-6 place-items-center rounded-md opacity-60 transition hover:bg-black/10 hover:text-red-500 hover:opacity-100 dark:hover:bg-white/10" aria-label={t("canvas.sidePanel.removePrompt")} title={t("canvas.sidePanel.removePrompt")}>
                                                        <Trash2 className="size-3.5" />
                                                    </button>
                                                </Popconfirm>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-4 text-center text-xs opacity-40">{keyword.trim() ? t("canvas.sidePanel.noMatchingPrompts") : t("canvas.sidePanel.noPersonalPrompts")}</div>
                            )}
                        </div>
                    ) : null}

                    <div className="flex items-center gap-1.5 px-1.5 pb-1 pt-2 text-xs font-semibold opacity-45">
                        <BookOpen className="size-3.5" />
                        {t("canvas.sidePanel.systemPrompts")}
                    </div>
                    {enabledSources.length ? enabledSources.map((source) => (
                        <PromptSourceGroup
                            key={source.id}
                            sourceId={source.id}
                            sourceName={source.name}
                            keyword={keyword}
                            open={!!expanded[source.id]}
                            theme={theme}
                            onToggle={() => setExpanded((prev) => ({ ...prev, [source.id]: !prev[source.id] }))}
                            onInsert={onInsert}
                            onView={setDetail}
                        />
                    )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("canvas.sidePanel.noPrompts")} className="pt-12" />}
                </div>
            </div>
            <PromptDetailDialog prompt={detail} onClose={() => setDetail(null)} onCopy={(prompt) => void copyPrompt(prompt)} />
            <Modal
                title={<span className="text-base font-semibold">{t("canvas.sidePanel.addPrompt")}</span>}
                open={adding}
                centered
                width={640}
                okText={t("canvas.sidePanel.savePrompt")}
                cancelText={t("common.cancel")}
                okButtonProps={{ disabled: !draftPrompt.trim(), className: "!rounded-full !px-6" }}
                cancelButtonProps={{ className: "!rounded-full !px-6" }}
                onOk={submitPersonal}
                onCancel={() => setAdding(false)}
                destroyOnHidden
            >
                <div className="space-y-3 pt-2" onWheelCapture={(event) => event.stopPropagation()}>
                    <Input size="large" placeholder={t("canvas.sidePanel.promptTitle")} value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} maxLength={60} />
                    <Input.TextArea
                        size="large"
                        placeholder={t("canvas.sidePanel.promptContent")}
                        value={draftPrompt}
                        onChange={(e) => setDraftPrompt(e.target.value)}
                        autoSize={{ minRows: 10, maxRows: 16 }}
                        maxLength={8000}
                        className="!text-[15px] !leading-6"
                    />
                    <div className="text-xs opacity-45">{t("canvas.sidePanel.addPromptHint")}</div>
                </div>
            </Modal>
        </div>
    );
});

function PromptSourceGroup({
    sourceId,
    sourceName,
    keyword,
    open,
    theme,
    onToggle,
    onInsert,
    onView,
}: {
    sourceId: string;
    sourceName: string;
    keyword: string;
    open: boolean;
    theme: CanvasTheme;
    onToggle: () => void;
    onInsert: (payload: InsertAssetPayload) => void;
    onView: (prompt: Prompt) => void;
}) {
    const { t } = useTranslation();
    // Cache a source after its first expansion to avoid repeated requests; search results also need the data for counts.
    const showResults = open || !!keyword.trim();
    const query = useQuery({ queryKey: ["side-panel-prompts", sourceId], queryFn: () => fetchSourcePrompts(sourceId), enabled: showResults, staleTime: 1000 * 60 * 60 });

    const filtered = useMemo(() => {
        const items = query.data || [];
        const q = keyword.trim().toLowerCase();
        if (!q) return items;
        return items.filter((item) => [item.title, item.prompt, ...item.tags].join(" ").toLowerCase().includes(q));
    }, [query.data, keyword]);

    const insertPrompt = (item: Prompt) => onInsert({ kind: "text", content: item.prompt, title: item.title });

    return (
        <div>
            <button type="button" onClick={onToggle} className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-xs font-semibold opacity-75 transition hover:opacity-100">
                <ChevronRight className={cn("size-3.5 transition-transform", showResults && "rotate-90")} />
                <BookOpen className="size-3.5" />
                <span className="min-w-0 flex-1 truncate">{sourceName}</span>
                {showResults && query.isSuccess ? <span className="opacity-50">{filtered.length}</span> : null}
            </button>
            {showResults ? (
                <div className="px-1 pb-2 pt-1">
                    {query.isLoading ? (
                        <div className="flex justify-center py-6">
                            <Spin size="small" />
                        </div>
                    ) : query.isError ? (
                        <button type="button" onClick={() => void query.refetch()} className="block w-full py-4 text-center text-xs text-red-500 opacity-80 transition hover:opacity-100">
                            {t("canvas.sidePanel.loadFailedRetry")}
                        </button>
                    ) : filtered.length ? (
                        <div className="space-y-1.5">
                            {filtered.map((item) => (
                                <PromptRow key={item.id} item={item} theme={theme} onInsert={() => insertPrompt(item)} onView={() => onView(item)} />
                            ))}
                        </div>
                    ) : (
                        <div className="py-4 text-center text-xs opacity-40">{keyword.trim() ? t("canvas.sidePanel.noMatchingPrompts") : t("canvas.sidePanel.sourceEmpty")}</div>
                    )}
                </div>
            ) : null}
        </div>
    );
}

function PromptRow({ item, theme, onInsert, onView }: { item: Prompt; theme: CanvasTheme; onInsert: () => void; onView: () => void }) {
    const { t } = useTranslation();
    return (
        <div className="group relative flex items-center gap-2.5 rounded-lg px-2 py-2 transition hover:bg-black/5 dark:hover:bg-white/5">
            {item.coverUrl ? (
                <img src={item.coverUrl} alt="" className="size-10 shrink-0 rounded-md object-cover" loading="lazy" />
            ) : (
                <span className="grid size-10 shrink-0 place-items-center rounded-md" style={{ background: theme.node.panel }}>
                    <FileText className="size-4 opacity-50" />
                </span>
            )}
            <button type="button" onClick={onView} className="min-w-0 flex-1 text-left">
                <div className="truncate text-sm font-medium leading-snug">{item.title}</div>
                <div className="mt-0.5 truncate text-xs leading-snug opacity-50">{item.prompt}</div>
            </button>
            <div className="flex shrink-0 flex-col items-center gap-0.5">
                <button type="button" onClick={onView} className="grid size-6 place-items-center rounded-md opacity-60 transition hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10" aria-label={t("canvas.sidePanel.viewDetails")} title={t("canvas.sidePanel.viewDetails")}>
                    <Eye className="size-3.5" />
                </button>
                <button
                    type="button"
                    onClick={onInsert}
                    className="grid size-6 place-items-center rounded-md opacity-60 transition hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10"
                    style={{ color: theme.toolbar.activeText }}
                    aria-label={t("canvas.sidePanel.inserted")}
                    title={t("canvas.sidePanel.inserted")}
                >
                    <Plus className="size-3.5" />
                </button>
            </div>
        </div>
    );
}

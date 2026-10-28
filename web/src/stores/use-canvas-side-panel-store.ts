import { create } from "zustand";

export const CANVAS_SIDE_PANEL_MOTION_MS = 500;
export const CANVAS_SIDE_PANEL_MIN_WIDTH = 220;
export const CANVAS_SIDE_PANEL_MAX_WIDTH = 480;
export const CANVAS_SIDE_PANEL_DEFAULT_WIDTH = 280;

const WIDTH_KEY = "canvas-side-panel-width";
const OPEN_KEY = "canvas-side-panel-open";
const NODE_VIEW_KEY = "canvas-side-panel-node-view";
const MODE_KEY = "canvas-side-panel-mode";

export type CanvasNodeViewMode = "list" | "grid";
export type CanvasSidePanelTab = "canvas" | "assets" | "prompts";
/** pill = 左侧浮动胶囊导航（默认）；classic = 经典整列侧栏 */
export type CanvasSidePanelMode = "pill" | "classic";

function initialWidth() {
    if (typeof window === "undefined") return CANVAS_SIDE_PANEL_DEFAULT_WIDTH;
    const stored = Number(localStorage.getItem(WIDTH_KEY));
    if (!stored) return CANVAS_SIDE_PANEL_DEFAULT_WIDTH;
    return Math.min(CANVAS_SIDE_PANEL_MAX_WIDTH, Math.max(CANVAS_SIDE_PANEL_MIN_WIDTH, stored));
}

function initialOpen() {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(OPEN_KEY) !== "0";
}

function initialNodeView(): CanvasNodeViewMode {
    if (typeof window === "undefined") return "list";
    return localStorage.getItem(NODE_VIEW_KEY) === "grid" ? "grid" : "list";
}

function initialMode(): CanvasSidePanelMode {
    if (typeof window === "undefined") return "pill";
    return localStorage.getItem(MODE_KEY) === "classic" ? "classic" : "pill";
}

type CanvasSidePanelStore = {
    width: number;
    panelOpen: boolean;
    panelMounted: boolean;
    panelClosing: boolean;
    nodeViewMode: CanvasNodeViewMode;
    mode: CanvasSidePanelMode;
    tab: CanvasSidePanelTab;
    setWidth: (width: number) => void;
    setNodeViewMode: (mode: CanvasNodeViewMode) => void;
    setMode: (mode: CanvasSidePanelMode) => void;
    setTab: (tab: CanvasSidePanelTab) => void;
    openPanel: () => void;
    closePanel: () => void;
    togglePanel: () => void;
    /** 胶囊导航点图标：同 tab 再点一次 = 收起，否则切 tab 并展开 */
    toggleTab: (tab: CanvasSidePanelTab) => void;
};

export const useCanvasSidePanelStore = create<CanvasSidePanelStore>((set, get) => ({
    width: initialWidth(),
    panelOpen: initialOpen(),
    panelMounted: initialOpen(),
    panelClosing: false,
    nodeViewMode: initialNodeView(),
    mode: initialMode(),
    tab: "canvas",
    setWidth: (width) => set({ width }),
    setNodeViewMode: (mode) => {
        if (typeof window !== "undefined") localStorage.setItem(NODE_VIEW_KEY, mode);
        set({ nodeViewMode: mode });
    },
    setMode: (mode) => {
        if (typeof window !== "undefined") localStorage.setItem(MODE_KEY, mode);
        if (mode === "classic") {
            // 经典侧栏没有独立 dock；切到 classic 时强制展开面板，否则两种导航会同时不可见。
            get().openPanel();
            return;
        }
        // 切回胶囊：收起面板，只留浮动胶囊（胶囊模式默认形态）。
        // 否则面板仍展开、位置与经典侧栏一致，用户会以为"没切回去"。
        get().closePanel();
    },
    setTab: (tab) => set({ tab }),
    openPanel: () => {
        if (typeof window !== "undefined") localStorage.setItem(OPEN_KEY, "1");
        set({ panelOpen: true, panelMounted: true, panelClosing: false });
    },
    closePanel: () => {
        if (!get().panelMounted || get().panelClosing) return;
        if (typeof window !== "undefined") localStorage.setItem(OPEN_KEY, "0");
        set({ panelOpen: false, panelClosing: true });
        setTimeout(() => {
            if (get().panelClosing) set({ panelMounted: false, panelClosing: false });
        }, CANVAS_SIDE_PANEL_MOTION_MS);
    },
    togglePanel: () => (get().panelOpen ? get().closePanel() : get().openPanel()),
    toggleTab: (tab) => {
        if (get().panelOpen && get().tab === tab) {
            get().closePanel();
            return;
        }
        set({ tab });
        get().openPanel();
    },
}));

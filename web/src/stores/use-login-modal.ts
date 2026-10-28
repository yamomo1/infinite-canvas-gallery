import { create } from "zustand";

// 登录弹窗的全局开关：顶栏按钮、画布深链失败等任意位置都能唤起同一个弹窗。
type LoginModalState = {
    open: boolean;
    reason?: string;
    requestLogin: (reason?: string) => void;
    close: () => void;
};

export const useLoginModalStore = create<LoginModalState>()((set) => ({
    open: false,
    reason: undefined,
    requestLogin: (reason) => set({ open: true, reason }),
    close: () => set({ open: false, reason: undefined }),
}));

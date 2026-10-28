import { useEffect } from "react";

import { ensureNewApiStudioChannel } from "@/services/newapi-studio";
import { useUserStore } from "@/stores/use-user-store";

// 登录成功后自动接入平台 API（画布专用令牌 + 模型列表）；
// 退出登录时保留已写入的渠道，避免用户正在编辑的模型配置突然失效。
export function useNewApiStudio() {
    useEffect(() => {
        let running = false;
        const run = async () => {
            if (running) return;
            running = true;
            try {
                await ensureNewApiStudioChannel();
            } catch (error) {
                console.warn("[canvas-studio] failed to attach platform API", error);
            } finally {
                running = false;
            }
        };

        if (useUserStore.getState().user) void run();
        const unsubscribe = useUserStore.subscribe((state) => {
            if (state.user) void run();
        });
        return unsubscribe;
    }, []);
}

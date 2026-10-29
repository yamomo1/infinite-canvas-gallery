import { create } from "zustand";

import { getSelf, login as apiLogin, getStoredToken, setStoredToken, refreshSession, type NewApiSelfUser } from "@/services/api/newapi";
import { ensureNewApiStudioChannel } from "@/services/newapi-studio";

// 主站登录后写下的可读提示 cookie（new_api_has_session=1），用于判断当前同域是否已有登录态，
// 避免未登录用户每次冷启动都白白打一次刷新请求。
function hasNewApiSessionHint(): boolean {
    return document.cookie
        .split("; ")
        .some((part) => part.trim().startsWith("new_api_has_session=1"));
}

export type LocalUser = {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
};

type UserStore = {
    user: LocalUser | null;
    // True until the persisted session (if any) has been resolved on startup.
    initializing: boolean;
    login: (username: string, password: string) => Promise<void>;
    logout: () => void;
    loadSession: () => Promise<void>;
};

function toLocalUser(user: NewApiSelfUser): LocalUser {
    return {
        id: String(user.id),
        username: user.username,
        displayName: user.display_name || user.username,
        avatarUrl: "",
    };
}

export const useUserStore = create<UserStore>()((set) => ({
    user: null,
    initializing: true,
    login: async (username, password) => {
        const data = await apiLogin(username, password);
        setStoredToken(data.access_token);
        set({ user: toLocalUser(data.user) });
        void ensureNewApiStudioChannel();
    },
    logout: () => {
        setStoredToken(null);
        set({ user: null });
    },
    loadSession: async () => {
        let token = getStoredToken();
        // 单点登录：已登录主站（同域 cookie）但画布本地无 token，先用登录态换发 Bearer
        if (!token && hasNewApiSessionHint()) {
            try {
                const refreshed = await refreshSession();
                setStoredToken(refreshed.access_token);
                token = refreshed.access_token;
            } catch {
                token = null;
            }
        }
        if (!token) {
            set({ initializing: false });
            return;
        }
        try {
            const self = await getSelf();
            set({ user: toLocalUser(self), initializing: false });
            void ensureNewApiStudioChannel();
        } catch {
            setStoredToken(null);
            set({ user: null, initializing: false });
        }
    },
}));

import { create } from "zustand";

import { getSelf, login as apiLogin, getStoredToken, setStoredToken, type NewApiSelfUser } from "@/services/api/newapi";

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
    },
    logout: () => {
        setStoredToken(null);
        set({ user: null });
    },
    loadSession: async () => {
        const token = getStoredToken();
        if (!token) {
            set({ initializing: false });
            return;
        }
        try {
            const self = await getSelf();
            set({ user: toLocalUser(self), initializing: false });
        } catch {
            setStoredToken(null);
            set({ user: null, initializing: false });
        }
    },
}));

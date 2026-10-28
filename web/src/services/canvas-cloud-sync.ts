// Cloud sync engine: mirrors local canvas projects to the New API backend
// (/api/canvas/v1/documents) when a user is signed in.
//
// Design notes:
// - Local projects keep their nanoid string id; the backend uses an
//   auto-increment numeric id. `CanvasProject.remoteId` stores that mapping so
//   repeated saves perform PUT instead of creating duplicates.
// - The backend `graph` column stores a JSON string of the canvas payload
//   (nodes / connections / chat sessions / viewport / ...), while gallery
//   metadata (title / description / visibility / thumbnail) lives in dedicated
//   columns.
// - Sync is best-effort and local-first: the local store remains the source of
//   truth, the backend is a durable mirror used by the gallery and other
//   devices.
import {
    createCanvasDocument,
    deleteCanvasDocument,
    getCanvasDocument,
    getPublicCanvasDocument,
    listMyCanvasDocuments,
    updateCanvasDocument,
    type CanvasDocumentMeta,
    type CloudVisibility,
} from "@/services/api/canvas-document";
import type { CanvasProject } from "@/stores/canvas/use-canvas-store";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useUserStore } from "@/stores/use-user-store";

type GraphPayload = Pick<CanvasProject, "nodes" | "connections" | "chatSessions" | "activeChatId" | "backgroundMode" | "showImageInfo" | "viewport">;

const PUSH_DEBOUNCE_MS = 1500;
// The backend stores the graph in a MEDIUMTEXT column (16 MB). Keep a safety
// margin so oversized canvases (large inline base64 images) fail loudly here
// instead of silently on the server.
const MAX_GRAPH_BYTES = 12 * 1024 * 1024;

function isLoggedIn(): boolean {
    return Boolean(useUserStore.getState().user);
}

export function serializeGraph(project: CanvasProject): string {
    const payload: GraphPayload = {
        nodes: project.nodes,
        connections: project.connections,
        chatSessions: project.chatSessions,
        activeChatId: project.activeChatId,
        backgroundMode: project.backgroundMode,
        showImageInfo: project.showImageInfo,
        viewport: project.viewport,
    };
    return JSON.stringify(payload);
}

export function deserializeGraph(json: string, doc: CanvasDocumentMeta): Partial<CanvasProject> {
    let graph: Partial<GraphPayload> = {};
    try {
        const parsed = JSON.parse(json) as Partial<GraphPayload>;
        if (parsed && typeof parsed === "object") graph = parsed;
    } catch {
        graph = {};
    }
    return {
        title: doc.title,
        description: doc.description,
        visibility: (doc.visibility || "private") as CloudVisibility,
        thumbnail: doc.thumbnail,
        createdAt: new Date(doc.created_at * 1000).toISOString(),
        ...graph,
    };
}

function shouldPush(project: CanvasProject): boolean {
    if (!isLoggedIn()) return false;
    if (project.remoteId == null) return true;
    const remoteUpdatedAt = project.remoteUpdatedAt ?? 0;
    // `updatedAt` is an ISO string, `remoteUpdatedAt` is epoch milliseconds.
    return Date.parse(project.updatedAt) > remoteUpdatedAt;
}

async function pushProject(project: CanvasProject): Promise<void> {
    const graph = serializeGraph(project);
    if (graph.length > MAX_GRAPH_BYTES) {
        console.warn(`[canvas-cloud] canvas "${project.title}" exceeds the cloud size limit (${graph.length} > ${MAX_GRAPH_BYTES}), skipped`);
        return;
    }
    const input = {
        title: project.title,
        graph,
        description: project.description ?? "",
        visibility: (project.visibility ?? "private") as CloudVisibility,
        thumbnail: project.thumbnail ?? "",
    };
    if (project.remoteId != null) {
        await updateCanvasDocument(project.remoteId, input);
        // The update endpoint returns no body, so trust the local clock. Use
        // max(now, updatedAt) to stay >= the project timestamp.
        useCanvasStore.getState().applyRemoteMeta(project.id, project.remoteId, Math.max(Date.now(), Date.parse(project.updatedAt)));
        return;
    }
    const created = await createCanvasDocument(input);
    useCanvasStore.getState().applyRemoteMeta(project.id, created.id, Math.max(created.updated_at * 1000, Date.parse(project.updatedAt)));
}

// Pushes every project whose local state is newer than the last cloud write.
// Returns the number of documents pushed.
export async function pushDirtyProjects(): Promise<number> {
    if (!isLoggedIn()) return 0;
    let pushed = 0;
    for (const project of useCanvasStore.getState().projects) {
        if (!shouldPush(project)) continue;
        try {
            await pushProject(project);
            pushed += 1;
        } catch (error) {
            console.warn("[canvas-cloud] push failed", project.id, error);
        }
    }
    return pushed;
}

// Pulls cloud documents into the local store. Idempotent: documents already
// mapped to a local project (same remoteId) are skipped. The list endpoint
// omits the graph body, so each unseen document is fetched individually.
export async function pullCloudProjects(): Promise<number> {
    if (!isLoggedIn()) return 0;
    const docs = await listMyCanvasDocuments();
    let pulled = 0;
    for (const doc of docs) {
        const existing = useCanvasStore.getState().projects.find((project) => project.remoteId === doc.id);
        if (existing) continue;
        const full = await getCanvasDocument(doc.id);
        const project = deserializeGraph(full.graph ?? "", full);
        useCanvasStore.getState().importCloudProject(project, full.id, full.updated_at * 1000);
        pulled += 1;
    }
    return pulled;
}

async function deleteRemoteDocument(remoteId: number): Promise<void> {
    try {
        await deleteCanvasDocument(remoteId);
    } catch (error) {
        console.warn("[canvas-cloud] delete failed", remoteId, error);
    }
}

// Opens a public gallery canvas by importing it as a new local project.
// Returns the new local project id.
export async function importPublicCanvas(remoteId: number): Promise<string> {
    const doc = await getPublicCanvasDocument(remoteId);
    const project = deserializeGraph(doc.graph ?? "", doc);
    return useCanvasStore.getState().importCloudProject(project, doc.id, doc.updated_at * 1000);
}

// Manual full sync (used by the "sync to cloud" button).
export async function syncCanvasToCloud(): Promise<{ pulled: number; pushed: number }> {
    if (!isLoggedIn()) throw new Error("Not signed in");
    const pulled = await pullCloudProjects();
    const pushed = await pushDirtyProjects();
    return { pulled, pushed };
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let remoteIdByLocalId = new Map<string, number>();
let deletedIds = new Set<string>();

function schedulePush(): void {
    if (!isLoggedIn()) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
        pushTimer = null;
        void pushDirtyProjects();
    }, PUSH_DEBOUNCE_MS);
}

// Resolves once the persisted canvas store has been rehydrated from IndexedDB.
// Pulling before hydration would be overwritten by the restore.
function waitForHydration(): Promise<void> {
    if (useCanvasStore.getState().hydrated) return Promise.resolve();
    return new Promise<void>((resolve) => {
        const unsubscribe = useCanvasStore.subscribe((state) => {
            if (!state.hydrated) return;
            unsubscribe();
            resolve();
        });
    });
}

async function runInitialSync(): Promise<void> {
    try {
        await waitForHydration();
        await pullCloudProjects();
        await pushDirtyProjects();
    } catch (error) {
        console.warn("[canvas-cloud] initial sync failed", error);
    }
}

// Subscribes to the user/canvas stores so that:
//  - signing in triggers a pull + push (restores cloud canvases on new device)
//  - local edits are debounced into a cloud save
//  - local deletions remove the mirrored document
// Returns an unsubscribe function.
export function installCloudSync(): () => void {
    remoteIdByLocalId = new Map(
        useCanvasStore
            .getState()
            .projects.filter((project) => project.remoteId != null)
            .map((project) => [project.id, project.remoteId as number]),
    );
    deletedIds = new Set(useCanvasStore.getState().deletedProjects.map((item) => item.id));

    // `main.tsx` starts session restoration before React mounts this listener,
    // so the user may already be signed in here. In that case run the initial
    // sync immediately instead of waiting for a login transition.
    let wasLoggedIn = isLoggedIn();
    if (wasLoggedIn) void runInitialSync();

    let initialSyncPending = false;
    const unsubscribeUser = useUserStore.subscribe((state) => {
        const loggedIn = Boolean(state.user);
        if (loggedIn && !wasLoggedIn && !initialSyncPending) {
            initialSyncPending = true;
            void runInitialSync().finally(() => {
                initialSyncPending = false;
            });
        }
        wasLoggedIn = loggedIn;
    });

    const unsubscribeCanvas = useCanvasStore.subscribe((state) => {
        const currentMap = new Map<string, number>(
            state.projects.filter((project) => project.remoteId != null).map((project) => [project.id, project.remoteId as number]),
        );
        for (const deleted of state.deletedProjects) {
            if (deletedIds.has(deleted.id)) continue;
            const remoteId = remoteIdByLocalId.get(deleted.id);
            if (remoteId != null) void deleteRemoteDocument(remoteId);
        }
        remoteIdByLocalId = currentMap;
        deletedIds = new Set(state.deletedProjects.map((item) => item.id));
        schedulePush();
    });

    return () => {
        unsubscribeUser();
        unsubscribeCanvas();
        if (pushTimer) {
            clearTimeout(pushTimer);
            pushTimer = null;
        }
    };
}

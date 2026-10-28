// Canvas document API client for the gallery fork of New API.
//
// Endpoints (see new-api-src/controller/canvas_document.go):
//   GET    /api/canvas/v1/documents          -> my documents (no graph body)
//   POST   /api/canvas/v1/documents          -> create, returns full document
//   GET    /api/canvas/v1/documents/:id      -> my document (with graph)
//   PUT    /api/canvas/v1/documents/:id      -> update (any field optional)
//   DELETE /api/canvas/v1/documents/:id      -> delete
//   GET    /api/canvas/v1/gallery            -> public gallery (no auth)
//   GET    /api/canvas/v1/gallery/:id        -> public document (no auth, public only)
//
// All authenticated calls reuse the shared New API request helper, which
// attaches the persisted Bearer token automatically.
import { apiRequest } from "@/services/api/newapi";

export type CloudVisibility = "private" | "public" | "unlist";

export type CanvasDocumentMeta = {
    id: number;
    user_id: number;
    title: string;
    description: string;
    visibility: CloudVisibility;
    thumbnail: string;
    author: string;
    created_at: number; // unix seconds
    updated_at: number; // unix seconds
};

export type CanvasDocument = CanvasDocumentMeta & {
    graph: string; // JSON string, see canvas-cloud-sync serializeGraph
};

export type CanvasDocumentInput = {
    title: string;
    graph: string;
    description?: string;
    visibility?: CloudVisibility;
    thumbnail?: string;
};

export type CanvasDocumentPatch = Partial<CanvasDocumentInput>;

export type PublicGalleryResult = {
    items: CanvasDocumentMeta[];
    total: number;
    offset: number;
    limit: number;
};

const BASE = "/canvas/v1";

export async function listMyCanvasDocuments(): Promise<CanvasDocumentMeta[]> {
    return apiRequest<CanvasDocumentMeta[]>(`${BASE}/documents`);
}

export async function createCanvasDocument(input: CanvasDocumentInput): Promise<CanvasDocument> {
    return apiRequest<CanvasDocument>(`${BASE}/documents`, {
        method: "POST",
        body: JSON.stringify(input),
    });
}

export async function getCanvasDocument(id: number): Promise<CanvasDocument> {
    return apiRequest<CanvasDocument>(`${BASE}/documents/${id}`);
}

export async function updateCanvasDocument(id: number, patch: CanvasDocumentPatch): Promise<void> {
    await apiRequest<null>(`${BASE}/documents/${id}`, {
        method: "PUT",
        body: JSON.stringify(patch),
    });
}

export async function deleteCanvasDocument(id: number): Promise<void> {
    await apiRequest<null>(`${BASE}/documents/${id}`, { method: "DELETE" });
}

export async function listPublicCanvasDocuments(offset = 0, limit = 24): Promise<PublicGalleryResult> {
    return apiRequest<PublicGalleryResult>(`${BASE}/gallery?offset=${offset}&limit=${limit}`);
}

export async function getPublicCanvasDocument(id: number): Promise<CanvasDocument> {
    return apiRequest<CanvasDocument>(`${BASE}/gallery/${id}`);
}

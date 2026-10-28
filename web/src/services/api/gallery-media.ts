// 画廊素材：拉取 New API 提示词画廊里收录的图片/视频作品，供画布资产面板直接插入。
// 公开接口无需登录态；同一域名部署（/api 反代），跨域部署时走 VITE_NEWAPI_BASE_URL。
import { NEWAPI_BASE, getStoredToken } from "./newapi";

export type GalleryMediaItem = {
    key: string;
    galleryId: number;
    title: string;
    type: "image" | "video";
    url: string;
    /** 视频封面（当 url 不可直接播放时用作缩略图） */
    poster?: string;
    author: string;
};

type GalleryApiItem = {
    id: number;
    title?: string;
    type?: string;
    cover?: string;
    media?: string;
    author?: string;
};

// 画廊媒体的可用形态：外链 http(s)、同源相对路径（/api/uploads/...）、
// 以及直接内联的 data URL（历史上传/种子数据），三者画布都能直接插入。
const USABLE_MEDIA = /^(https?:\/\/|\/|data:(?:image|video)\/)/i;

function parseMediaUrls(media: string | undefined): string[] {
    if (!media) return [];
    try {
        const parsed = JSON.parse(media);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((item): item is string => typeof item === "string" && USABLE_MEDIA.test(item));
    } catch {
        return typeof media === "string" && USABLE_MEDIA.test(media) ? [media] : [];
    }
}

function toMediaItems(items: GalleryApiItem[]): GalleryMediaItem[] {
    const result: GalleryMediaItem[] = [];
    for (const item of items) {
        const type: "image" | "video" = item.type === "video" ? "video" : "image";
        const urls = parseMediaUrls(item.media);
        if (!urls.length && item.cover && USABLE_MEDIA.test(item.cover) && type === "image") urls.push(item.cover);
        urls.forEach((url, index) => {
            const poster = item.cover && USABLE_MEDIA.test(item.cover) && item.cover !== url ? item.cover : undefined;
            result.push({
                key: `g${item.id}-${index}`,
                galleryId: item.id,
                title: item.title || `#${item.id}`,
                type,
                url,
                poster,
                author: item.author || "",
            });
        });
    }
    return result;
}

async function fetchGalleryItems(path: string, limit: number, withAuth: boolean): Promise<GalleryMediaItem[]> {
    const token = withAuth ? getStoredToken() : null;
    if (withAuth && !token) return [];
    const headers: Record<string, string> = { accept: "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetch(`${NEWAPI_BASE}${path}?limit=${limit}`, { headers });
    const body = (await response.json().catch(() => null)) as { success?: boolean; data?: { items?: GalleryApiItem[] } } | null;
    return toMediaItems(body?.data?.items || []);
}

export function fetchGalleryMedia(limit = 100): Promise<GalleryMediaItem[]> {
    return fetchGalleryItems("/prompt-gallery/v1/prompts", limit, false);
}

// 我在画廊里收藏的作品（登录后跨端同步，画布不同域名也能读到）
export function fetchFavoriteGalleryMedia(limit = 100): Promise<GalleryMediaItem[]> {
    return fetchGalleryItems("/prompt-gallery/v1/favorites", limit, true);
}

export function hasGallerySession(): boolean {
    return Boolean(getStoredToken());
}

// 画廊素材：拉取 New API 提示词画廊里收录的图片/视频作品，供画布资产面板直接插入。
// 公开接口无需登录态；同一域名部署（/api 反代），跨域部署时走 VITE_NEWAPI_BASE_URL。
import { NEWAPI_BASE } from "./newapi";

export type GalleryMediaItem = {
    key: string;
    galleryId: number;
    title: string;
    type: "image" | "video";
    url: string;
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

function parseMediaUrls(media: string | undefined): string[] {
    if (!media) return [];
    try {
        const parsed = JSON.parse(media);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((item): item is string => typeof item === "string" && /^https?:\/\//.test(item));
    } catch {
        return typeof media === "string" && /^https?:\/\//.test(media) ? [media] : [];
    }
}

export async function fetchGalleryMedia(limit = 100): Promise<GalleryMediaItem[]> {
    const response = await fetch(`${NEWAPI_BASE}/prompt-gallery/v1/prompts?limit=${limit}`, { headers: { accept: "application/json" } });
    const body = (await response.json().catch(() => null)) as { success?: boolean; data?: { items?: GalleryApiItem[] } } | null;
    const items = body?.data?.items || [];
    const result: GalleryMediaItem[] = [];
    for (const item of items) {
        const type: "image" | "video" = item.type === "video" ? "video" : "image";
        const urls = parseMediaUrls(item.media);
        if (!urls.length && item.cover && /^https?:\/\//.test(item.cover) && type === "image") urls.push(item.cover);
        urls.forEach((url, index) => {
            result.push({
                key: `g${item.id}-${index}`,
                galleryId: item.id,
                title: item.title || `#${item.id}`,
                type,
                url,
                author: item.author || "",
            });
        });
    }
    return result;
}

// 登录后自动把「平台 API」接入画布配置：
// 用 new-api 的登录态换一个画布专用令牌（后端 /api/canvas/v1/session），
// 再拉一次 /v1/models 填充模型列表。用户不需要自己创建 sk- 令牌。
import { getCanvasSession } from "@/services/api/newapi";
import { createModelChannel, guessCapability, useConfigStore } from "@/stores/use-config-store";

const STUDIO_CHANNEL_ID = "newapi-studio";
const STUDIO_CHANNEL_NAME = "New API";

async function fetchModelIds(baseUrl: string, apiKey: string): Promise<string[]> {
    try {
        const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
            headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
        });
        if (!response.ok) return [];
        const body = (await response.json()) as { data?: Array<{ id?: string }> };
        return (body.data ?? [])
            .map((item) => item?.id?.trim() ?? "")
            .filter((id) => id !== "");
    } catch {
        return [];
    }
}

/**
 * 拉取画布凭证并写入配置。返回是否成功接入。
 * 只更新自己的 "newapi-studio" 渠道，不动用户手动配置的其它渠道。
 */
export async function ensureNewApiStudioChannel(): Promise<boolean> {
    const session = await getCanvasSession();
    if (!session?.token || !session?.base_url) return false;

    const models = await fetchModelIds(session.base_url, session.token);
    const channel = createModelChannel({
        id: STUDIO_CHANNEL_ID,
        name: STUDIO_CHANNEL_NAME,
        baseUrl: session.base_url,
        apiKey: session.token,
        apiFormat: "openai",
        models: models.map((name) => ({ name, capability: guessCapability(name) })),
    });

    const store = useConfigStore.getState();
    store.updateConfig("channels", [...store.config.channels.filter((item) => item.id !== STUDIO_CHANNEL_ID), channel]);

    // 当前模型不可用（没配渠道 / 没密钥）时，自动切到平台提供的模型
    const next = useConfigStore.getState();
    if (!next.isAiConfigReady(next.config, next.config.textModel)) {
        const textModel = channel.models.find((item) => item.capability === "text")?.name ?? channel.models[0]?.name;
        if (textModel) {
            next.updateConfig("textModel", `${STUDIO_CHANNEL_ID}::${textModel}`);
            if (!next.config.model.includes("::")) next.updateConfig("model", `${STUDIO_CHANNEL_ID}::${textModel}`);
        }
    }
    // 生图 / 生视频也一并指向平台模型（用户自己配过就不动）
    const after = useConfigStore.getState();
    const pick = (capability: "image" | "video") => channel.models.find((item) => item.capability === capability)?.name;
    if (!after.isAiConfigReady(after.config, after.config.imageModel)) {
        const model = pick("image");
        if (model) after.updateConfig("imageModel", `${STUDIO_CHANNEL_ID}::${model}`);
    }
    if (!after.isAiConfigReady(after.config, after.config.videoModel)) {
        const model = pick("video");
        if (model) after.updateConfig("videoModel", `${STUDIO_CHANNEL_ID}::${model}`);
    }
    return true;
}

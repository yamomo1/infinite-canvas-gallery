export const APP_VERSION = __APP_VERSION__ || "dev";

// New API 平台运营站点（画布菜单「主页 / 文档」指向这里，可用环境变量覆盖）
export const NEWAPI_SITE_URL = import.meta.env.VITE_NEWAPI_SITE_URL || "https://cdymm.com";

export const DOCS_URL = import.meta.env.VITE_DOC_URL || NEWAPI_SITE_URL;

// Official plugin registry URL: CI publishes to plugins-dist for jsDelivr delivery; an environment variable may override it for self-hosting.
export const PLUGIN_REGISTRY_URL = import.meta.env.VITE_PLUGIN_REGISTRY_URL || "https://cdn.jsdelivr.net/gh/basketikun/infinite-canvas@plugins-dist/official-plugins.json";

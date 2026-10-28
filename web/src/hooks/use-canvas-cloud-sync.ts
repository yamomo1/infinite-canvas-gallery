import { useEffect } from "react";

import { installCloudSync } from "@/services/canvas-cloud-sync";

// Installs the New API cloud sync listeners for the lifetime of the app.
export function useCanvasCloudSync() {
    useEffect(() => installCloudSync(), []);
}

import { createProxyRoute } from "../../proxy-route";
import { memoryRoutes } from "../../routes";

const proxy = createProxyRoute("memory", memoryRoutes);

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE };

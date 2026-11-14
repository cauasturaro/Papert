import { createProxyRoute } from "../../proxy-route";
import { engagementRoutes } from "../../routes";

const proxy = createProxyRoute("engagement", engagementRoutes);

export { proxy as GET, proxy as PUT };

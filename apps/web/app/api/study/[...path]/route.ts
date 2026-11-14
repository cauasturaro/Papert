import { createProxyRoute } from "../../proxy-route";
import { studyRoutes } from "../../routes";

const proxy = createProxyRoute("study", studyRoutes);

export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE };

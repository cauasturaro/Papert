import { createProxyRoute } from "../../proxy-route";
import { communityRoutes } from "../../routes";

const proxy = createProxyRoute("community", communityRoutes);

export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE };

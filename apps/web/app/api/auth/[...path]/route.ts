import { createProxyRoute } from "../../proxy-route";
import { authRoutes } from "../../routes";

const proxy = createProxyRoute("auth", authRoutes);

export { proxy as GET, proxy as POST };

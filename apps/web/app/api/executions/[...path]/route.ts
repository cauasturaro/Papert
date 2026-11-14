import { createProxyRoute } from "../../proxy-route";
import { executionRoutes } from "../../routes";

const proxy = createProxyRoute("executions", executionRoutes);

export { proxy as GET, proxy as POST };

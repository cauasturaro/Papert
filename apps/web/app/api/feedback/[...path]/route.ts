import { createProxyRoute } from "../../proxy-route";
import { feedbackRoutes } from "../../routes";

const proxy = createProxyRoute("feedback", feedbackRoutes);

export { proxy as GET, proxy as PUT, proxy as DELETE };

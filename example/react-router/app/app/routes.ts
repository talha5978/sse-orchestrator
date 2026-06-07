import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("hooks-implementation", "./routes/hooks-implementation.tsx"),
] satisfies RouteConfig;

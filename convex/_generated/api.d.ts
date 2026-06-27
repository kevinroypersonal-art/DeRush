/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agents from "../agents.js";
import type * as agentsNode from "../agentsNode.js";
import type * as migrations from "../migrations.js";
import type * as onboarding from "../onboarding.js";
import type * as projects from "../projects.js";
import type * as projectsNode from "../projectsNode.js";
import type * as srt from "../srt.js";
import type * as xmeml from "../xmeml.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agents: typeof agents;
  agentsNode: typeof agentsNode;
  migrations: typeof migrations;
  onboarding: typeof onboarding;
  projects: typeof projects;
  projectsNode: typeof projectsNode;
  srt: typeof srt;
  xmeml: typeof xmeml;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

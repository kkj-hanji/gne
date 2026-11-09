/**
 * GNDEC Compass Next — Worker entrypoint.
 *
 * Workers module syntax only allows handler exports here, so the implementation
 * lives in `next-core.js` and this file exposes exactly one `fetch` handler.
 */

import { handleRequest } from "./next-core.js";

export default {
  fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  }
};

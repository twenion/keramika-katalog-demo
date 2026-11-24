import { readFile } from "node:fs/promises";

const core = new URL("../js/core/", import.meta.url).href;

/** Load the browser's .js modules on Node releases without ES module syntax detection. */
export async function load(url, context, nextLoad) {
  if (url.startsWith(core) && url.endsWith(".js")) {
    return { format: "module", shortCircuit: true, source: await readFile(new URL(url), "utf8") };
  }
  return nextLoad(url, context);
}

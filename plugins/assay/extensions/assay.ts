import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { assayTool } from "../lib/tool.ts";

export default function assayExtension(pi: ExtensionAPI) {
  pi.registerTool(assayTool(pi));
}

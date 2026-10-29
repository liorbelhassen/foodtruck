import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vite";
import baseConfig from "../vite.config.js";

const emulatorFirebase = fileURLToPath(new URL("./firebase.emulator.js", import.meta.url));

export default mergeConfig(
  baseConfig,
  defineConfig({
    root: fileURLToPath(new URL("..", import.meta.url)),
    resolve: {
      alias: [{ find: /^(\.\.?\/)+firebase(\.js)?$/, replacement: emulatorFirebase }],
    },
    server: { host: "127.0.0.1", port: 5181, strictPort: true },
  })
);

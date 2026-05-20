// vite.config.ts
import { defineConfig } from "file:///C:/Users/sukes/Downloads/slidebot/node_modules/.pnpm/vite@5.4.21_@types+node@22.19.19/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/sukes/Downloads/slidebot/node_modules/.pnpm/@vitejs+plugin-react@4.7.0_vite@5.4.21_@types+node@22.19.19_/node_modules/@vitejs/plugin-react/dist/index.js";
import { crx } from "file:///C:/Users/sukes/Downloads/slidebot/node_modules/.pnpm/@crxjs+vite-plugin@2.4.0_vite@5.4.21_@types+node@22.19.19_/node_modules/@crxjs/vite-plugin/dist/index.mjs";
import path from "path";

// manifest.json
var manifest_default = {
  manifest_version: 3,
  name: "SlideBot \u2014 Collaborative Presentations",
  short_name: "SlideBot",
  version: "0.1.0",
  description: "Synchronized multiplayer presentations for Google Meet. Real-time slide sync, annotations, and presenter handoff.",
  icons: {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  action: {
    default_popup: "src/popup/index.html",
    default_icon: {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    },
    default_title: "SlideBot"
  },
  background: {
    service_worker: "src/background/service-worker.ts",
    type: "module"
  },
  content_scripts: [
    {
      matches: ["https://meet.google.com/*"],
      js: ["src/content/index.ts"],
      run_at: "document_idle",
      all_frames: false
    }
  ],
  permissions: ["storage", "tabs", "activeTab", "scripting", "notifications"],
  host_permissions: [
    "https://meet.google.com/*",
    "http://localhost:4000/*",
    "https://*.slidebot.app/*"
  ],
  web_accessible_resources: [
    {
      resources: ["icons/*", "src/content/overlay/overlay.css"],
      matches: ["https://meet.google.com/*"]
    }
  ],
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'"
  },
  minimum_chrome_version: "116"
};

// vite.config.ts
var __vite_injected_original_dirname = "C:\\Users\\sukes\\Downloads\\slidebot\\apps\\extension";
var vite_config_default = defineConfig({
  plugins: [react(), crx({ manifest: manifest_default })],
  resolve: {
    alias: {
      "@ext": path.resolve(__vite_injected_original_dirname, "./src"),
      "@slidebot/shared-types": path.resolve(__vite_injected_original_dirname, "../../packages/shared-types/src"),
      "@slidebot/shared-utils": path.resolve(__vite_injected_original_dirname, "../../packages/shared-utils/src")
    }
  },
  build: {
    // Emit source maps for debugging in Chrome DevTools
    sourcemap: process.env.NODE_ENV === "development",
    rollupOptions: {
      output: {
        // Prevent chunk splitting that breaks extension loading
        manualChunks: void 0
      }
    }
  },
  // Required for @crxjs/vite-plugin HMR
  server: {
    port: 5174,
    strictPort: true,
    hmr: {
      port: 5174
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiLCAibWFuaWZlc3QuanNvbiJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXHN1a2VzXFxcXERvd25sb2Fkc1xcXFxzbGlkZWJvdFxcXFxhcHBzXFxcXGV4dGVuc2lvblwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcc3VrZXNcXFxcRG93bmxvYWRzXFxcXHNsaWRlYm90XFxcXGFwcHNcXFxcZXh0ZW5zaW9uXFxcXHZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi9Vc2Vycy9zdWtlcy9Eb3dubG9hZHMvc2xpZGVib3QvYXBwcy9leHRlbnNpb24vdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5pbXBvcnQgeyBjcnggfSBmcm9tICdAY3J4anMvdml0ZS1wbHVnaW4nO1xuaW1wb3J0IHBhdGggZnJvbSAncGF0aCc7XG5cbmltcG9ydCBtYW5pZmVzdCBmcm9tICcuL21hbmlmZXN0Lmpzb24nO1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICBwbHVnaW5zOiBbcmVhY3QoKSwgY3J4KHsgbWFuaWZlc3QgfSldLFxuICByZXNvbHZlOiB7XG4gICAgYWxpYXM6IHtcbiAgICAgICdAZXh0JzogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJy4vc3JjJyksXG4gICAgICAnQHNsaWRlYm90L3NoYXJlZC10eXBlcyc6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuLi8uLi9wYWNrYWdlcy9zaGFyZWQtdHlwZXMvc3JjJyksXG4gICAgICAnQHNsaWRlYm90L3NoYXJlZC11dGlscyc6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuLi8uLi9wYWNrYWdlcy9zaGFyZWQtdXRpbHMvc3JjJyksXG4gICAgfSxcbiAgfSxcbiAgYnVpbGQ6IHtcbiAgICAvLyBFbWl0IHNvdXJjZSBtYXBzIGZvciBkZWJ1Z2dpbmcgaW4gQ2hyb21lIERldlRvb2xzXG4gICAgc291cmNlbWFwOiBwcm9jZXNzLmVudi5OT0RFX0VOViA9PT0gJ2RldmVsb3BtZW50JyxcbiAgICByb2xsdXBPcHRpb25zOiB7XG4gICAgICBvdXRwdXQ6IHtcbiAgICAgICAgLy8gUHJldmVudCBjaHVuayBzcGxpdHRpbmcgdGhhdCBicmVha3MgZXh0ZW5zaW9uIGxvYWRpbmdcbiAgICAgICAgbWFudWFsQ2h1bmtzOiB1bmRlZmluZWQsXG4gICAgICB9LFxuICAgIH0sXG4gIH0sXG4gIC8vIFJlcXVpcmVkIGZvciBAY3J4anMvdml0ZS1wbHVnaW4gSE1SXG4gIHNlcnZlcjoge1xuICAgIHBvcnQ6IDUxNzQsXG4gICAgc3RyaWN0UG9ydDogdHJ1ZSxcbiAgICBobXI6IHtcbiAgICAgIHBvcnQ6IDUxNzQsXG4gICAgfSxcbiAgfSxcbn0pO1xuIiwgIntcbiAgXCJtYW5pZmVzdF92ZXJzaW9uXCI6IDMsXG4gIFwibmFtZVwiOiBcIlNsaWRlQm90IFx1MjAxNCBDb2xsYWJvcmF0aXZlIFByZXNlbnRhdGlvbnNcIixcbiAgXCJzaG9ydF9uYW1lXCI6IFwiU2xpZGVCb3RcIixcbiAgXCJ2ZXJzaW9uXCI6IFwiMC4xLjBcIixcbiAgXCJkZXNjcmlwdGlvblwiOiBcIlN5bmNocm9uaXplZCBtdWx0aXBsYXllciBwcmVzZW50YXRpb25zIGZvciBHb29nbGUgTWVldC4gUmVhbC10aW1lIHNsaWRlIHN5bmMsIGFubm90YXRpb25zLCBhbmQgcHJlc2VudGVyIGhhbmRvZmYuXCIsXG5cbiAgXCJpY29uc1wiOiB7XG4gICAgXCIxNlwiOiBcImljb25zL2ljb24xNi5wbmdcIixcbiAgICBcIjMyXCI6IFwiaWNvbnMvaWNvbjMyLnBuZ1wiLFxuICAgIFwiNDhcIjogXCJpY29ucy9pY29uNDgucG5nXCIsXG4gICAgXCIxMjhcIjogXCJpY29ucy9pY29uMTI4LnBuZ1wiXG4gIH0sXG5cbiAgXCJhY3Rpb25cIjoge1xuICAgIFwiZGVmYXVsdF9wb3B1cFwiOiBcInNyYy9wb3B1cC9pbmRleC5odG1sXCIsXG4gICAgXCJkZWZhdWx0X2ljb25cIjoge1xuICAgICAgXCIxNlwiOiBcImljb25zL2ljb24xNi5wbmdcIixcbiAgICAgIFwiMzJcIjogXCJpY29ucy9pY29uMzIucG5nXCIsXG4gICAgICBcIjQ4XCI6IFwiaWNvbnMvaWNvbjQ4LnBuZ1wiLFxuICAgICAgXCIxMjhcIjogXCJpY29ucy9pY29uMTI4LnBuZ1wiXG4gICAgfSxcbiAgICBcImRlZmF1bHRfdGl0bGVcIjogXCJTbGlkZUJvdFwiXG4gIH0sXG5cbiAgXCJiYWNrZ3JvdW5kXCI6IHtcbiAgICBcInNlcnZpY2Vfd29ya2VyXCI6IFwic3JjL2JhY2tncm91bmQvc2VydmljZS13b3JrZXIudHNcIixcbiAgICBcInR5cGVcIjogXCJtb2R1bGVcIlxuICB9LFxuXG4gIFwiY29udGVudF9zY3JpcHRzXCI6IFtcbiAgICB7XG4gICAgICBcIm1hdGNoZXNcIjogW1wiaHR0cHM6Ly9tZWV0Lmdvb2dsZS5jb20vKlwiXSxcbiAgICAgIFwianNcIjogW1wic3JjL2NvbnRlbnQvaW5kZXgudHNcIl0sXG4gICAgICBcInJ1bl9hdFwiOiBcImRvY3VtZW50X2lkbGVcIixcbiAgICAgIFwiYWxsX2ZyYW1lc1wiOiBmYWxzZVxuICAgIH1cbiAgXSxcblxuICBcInBlcm1pc3Npb25zXCI6IFtcInN0b3JhZ2VcIiwgXCJ0YWJzXCIsIFwiYWN0aXZlVGFiXCIsIFwic2NyaXB0aW5nXCIsIFwibm90aWZpY2F0aW9uc1wiXSxcblxuICBcImhvc3RfcGVybWlzc2lvbnNcIjogW1xuICAgIFwiaHR0cHM6Ly9tZWV0Lmdvb2dsZS5jb20vKlwiLFxuICAgIFwiaHR0cDovL2xvY2FsaG9zdDo0MDAwLypcIixcbiAgICBcImh0dHBzOi8vKi5zbGlkZWJvdC5hcHAvKlwiXG4gIF0sXG5cbiAgXCJ3ZWJfYWNjZXNzaWJsZV9yZXNvdXJjZXNcIjogW1xuICAgIHtcbiAgICAgIFwicmVzb3VyY2VzXCI6IFtcImljb25zLypcIiwgXCJzcmMvY29udGVudC9vdmVybGF5L292ZXJsYXkuY3NzXCJdLFxuICAgICAgXCJtYXRjaGVzXCI6IFtcImh0dHBzOi8vbWVldC5nb29nbGUuY29tLypcIl1cbiAgICB9XG4gIF0sXG5cbiAgXCJjb250ZW50X3NlY3VyaXR5X3BvbGljeVwiOiB7XG4gICAgXCJleHRlbnNpb25fcGFnZXNcIjogXCJzY3JpcHQtc3JjICdzZWxmJzsgb2JqZWN0LXNyYyAnc2VsZidcIlxuICB9LFxuXG4gIFwibWluaW11bV9jaHJvbWVfdmVyc2lvblwiOiBcIjExNlwiXG59XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQWdWLFNBQVMsb0JBQW9CO0FBQzdXLE9BQU8sV0FBVztBQUNsQixTQUFTLFdBQVc7QUFDcEIsT0FBTyxVQUFVOzs7QUNIakI7QUFBQSxFQUNFLGtCQUFvQjtBQUFBLEVBQ3BCLE1BQVE7QUFBQSxFQUNSLFlBQWM7QUFBQSxFQUNkLFNBQVc7QUFBQSxFQUNYLGFBQWU7QUFBQSxFQUVmLE9BQVM7QUFBQSxJQUNQLE1BQU07QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxFQUNUO0FBQUEsRUFFQSxRQUFVO0FBQUEsSUFDUixlQUFpQjtBQUFBLElBQ2pCLGNBQWdCO0FBQUEsTUFDZCxNQUFNO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTixPQUFPO0FBQUEsSUFDVDtBQUFBLElBQ0EsZUFBaUI7QUFBQSxFQUNuQjtBQUFBLEVBRUEsWUFBYztBQUFBLElBQ1osZ0JBQWtCO0FBQUEsSUFDbEIsTUFBUTtBQUFBLEVBQ1Y7QUFBQSxFQUVBLGlCQUFtQjtBQUFBLElBQ2pCO0FBQUEsTUFDRSxTQUFXLENBQUMsMkJBQTJCO0FBQUEsTUFDdkMsSUFBTSxDQUFDLHNCQUFzQjtBQUFBLE1BQzdCLFFBQVU7QUFBQSxNQUNWLFlBQWM7QUFBQSxJQUNoQjtBQUFBLEVBQ0Y7QUFBQSxFQUVBLGFBQWUsQ0FBQyxXQUFXLFFBQVEsYUFBYSxhQUFhLGVBQWU7QUFBQSxFQUU1RSxrQkFBb0I7QUFBQSxJQUNsQjtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsRUFDRjtBQUFBLEVBRUEsMEJBQTRCO0FBQUEsSUFDMUI7QUFBQSxNQUNFLFdBQWEsQ0FBQyxXQUFXLGlDQUFpQztBQUFBLE1BQzFELFNBQVcsQ0FBQywyQkFBMkI7QUFBQSxJQUN6QztBQUFBLEVBQ0Y7QUFBQSxFQUVBLHlCQUEyQjtBQUFBLElBQ3pCLGlCQUFtQjtBQUFBLEVBQ3JCO0FBQUEsRUFFQSx3QkFBMEI7QUFDNUI7OztBRDNEQSxJQUFNLG1DQUFtQztBQU96QyxJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixTQUFTLENBQUMsTUFBTSxHQUFHLElBQUksRUFBRSwyQkFBUyxDQUFDLENBQUM7QUFBQSxFQUNwQyxTQUFTO0FBQUEsSUFDUCxPQUFPO0FBQUEsTUFDTCxRQUFRLEtBQUssUUFBUSxrQ0FBVyxPQUFPO0FBQUEsTUFDdkMsMEJBQTBCLEtBQUssUUFBUSxrQ0FBVyxpQ0FBaUM7QUFBQSxNQUNuRiwwQkFBMEIsS0FBSyxRQUFRLGtDQUFXLGlDQUFpQztBQUFBLElBQ3JGO0FBQUEsRUFDRjtBQUFBLEVBQ0EsT0FBTztBQUFBO0FBQUEsSUFFTCxXQUFXLFFBQVEsSUFBSSxhQUFhO0FBQUEsSUFDcEMsZUFBZTtBQUFBLE1BQ2IsUUFBUTtBQUFBO0FBQUEsUUFFTixjQUFjO0FBQUEsTUFDaEI7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUFBO0FBQUEsRUFFQSxRQUFRO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixZQUFZO0FBQUEsSUFDWixLQUFLO0FBQUEsTUFDSCxNQUFNO0FBQUEsSUFDUjtBQUFBLEVBQ0Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=

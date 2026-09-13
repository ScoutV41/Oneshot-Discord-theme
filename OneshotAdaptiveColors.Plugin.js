/**
 * @name OneShotAdaptiveColors
 * @author Scout_C7
 * @version 2.0.0
 * @description Reads whatever background image you're using with the OneShot - Niko
 * (Glass) theme, extracts a color palette from it, and feeds those colors into the
 * theme's CSS variables — so anyone can drop in their own OneShot art and get the
 * theme's gradients/accents auto-matched to it instead of manually picking hex codes.
 * @source https://github.com/Scout_C7
 */

module.exports = class OneShotAdaptiveColors {
  constructor(meta) {
    this.meta = meta;
    this.styleEl = null;
    this.settings = { imageUrl: "", sampleSize: 60, active: false };
  }

  start() {
    this.loadSettings();
    if (this.settings.active && this.settings.imageUrl) {
      this.generatePalette(this.settings.imageUrl);
    }
  }

  stop() {
    if (this.styleEl) {
      this.styleEl.remove();
      this.styleEl = null;
    }
  }

  resetPalette() {
    if (this.styleEl) {
      this.styleEl.remove();
      this.styleEl = null;
    }
    this.settings.active = false;
    this.saveSettings();
    BdApi.UI.showToast("Reverted to the default OneShot pink/magenta palette.", { type: "info" });
  }

  loadSettings() {
    const saved = BdApi.Data.load(this.meta.name, "settings");
    if (saved) this.settings = { ...this.settings, ...saved };
  }

  saveSettings() {
    BdApi.Data.save(this.meta.name, "settings", this.settings);
  }

  // ------------------------------------------------------------------
  // SETTINGS PANEL — a text field for the image URL/path + a button
  // ------------------------------------------------------------------
  getSettingsPanel() {
    const panel = document.createElement("div");
    panel.style.padding = "16px";
    panel.style.color = "#f5e6d3";
    panel.style.fontFamily = "var(--font-primary, sans-serif)";

    const label = document.createElement("label");
    label.textContent = "Background image URL (https://...) or local path (file:///...):";
    label.style.display = "block";
    label.style.marginBottom = "8px";
    label.style.fontSize = "14px";

    const input = document.createElement("input");
    input.type = "text";
    input.value = this.settings.imageUrl;
    input.placeholder = "https://i.redd.it/your-image-id.png";
    input.style.width = "100%";
    input.style.boxSizing = "border-box";
    input.style.padding = "8px";
    input.style.marginBottom = "12px";
    input.style.borderRadius = "6px";
    input.style.border = "1px solid #4a2350";
    input.style.background = "#241536";
    input.style.color = "#f5e6d3";

    const button = document.createElement("button");
    button.textContent = "Generate Palette";
    button.style.padding = "8px 16px";
    button.style.marginRight = "8px";
    button.style.borderRadius = "6px";
    button.style.border = "none";
    button.style.background = "#f4c542";
    button.style.color = "#241536";
    button.style.fontWeight = "bold";
    button.style.cursor = "pointer";
    button.onclick = () => {
      this.settings.imageUrl = input.value.trim();
      this.settings.active = true;
      this.saveSettings();
      this.generatePalette(this.settings.imageUrl);
    };

    const resetButton = document.createElement("button");
    resetButton.textContent = "Reset to Default";
    resetButton.style.padding = "8px 16px";
    resetButton.style.borderRadius = "6px";
    resetButton.style.border = "1px solid #8c2f5c";
    resetButton.style.background = "transparent";
    resetButton.style.color = "#f5e6d3";
    resetButton.style.cursor = "pointer";
    resetButton.onclick = () => this.resetPalette();

    const note = document.createElement("p");
    note.style.marginTop = "10px";
    note.style.fontSize = "12px";
    note.style.opacity = "0.7";
    note.textContent =
      "Note: some remote hosts block pixel-reading for cross-origin images. " +
      "If a URL fails, try a local file path instead, or a different host.";

    panel.append(label, input, button, resetButton, note);
    return panel;
  }

  // ------------------------------------------------------------------
  // PALETTE GENERATION
  // ------------------------------------------------------------------
  async generatePalette(url) {
    if (!url) return;

    // data:/file: URLs don't hit Discord's CSP or need a network fetch —
    // load them directly.
    if (url.startsWith("data:") || url.startsWith("file:")) {
      this.loadImageElement(url);
      return;
    }

    // Remote URLs: Discord's CSP blocks a plain <img src="..."> fetch to
    // most external hosts (imgur, i.redd.it, etc.) before it even tries.
    // BdApi.Net.fetch bypasses that since it doesn't route through the
    // page's own resource-loading pipeline.
    if (BdApi.Net && BdApi.Net.fetch) {
      try {
        const res = await BdApi.Net.fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buffer = await res.arrayBuffer();
        const contentType = res.headers?.get?.("content-type") || this.guessMimeType(url);
        const base64 = this.arrayBufferToBase64(buffer);
        this.loadImageElement(`data:${contentType};base64,${base64}`);
      } catch (e) {
        console.error("[OneShotAdaptiveColors] BdApi.Net.fetch failed:", url, e);
        BdApi.UI.showToast(
          "Couldn't download that image — check it's a direct image link (right-click the image → Copy image address), not a page URL.",
          { type: "error" }
        );
      }
    } else {
      // Older BD versions without BdApi.Net — fall back to the direct
      // method, which may still get blocked by Discord's CSP.
      this.loadImageElement(url);
    }
  }

  guessMimeType(url) {
    const ext = url.split("?")[0].split(".").pop().toLowerCase();
    const map = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };
    return map[ext] || "image/png";
  }

  arrayBufferToBase64(buffer) {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  loadImageElement(src) {
    const img = new Image();
    img.onload = () => {
      const size = this.settings.sampleSize;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, size, size);

      let pixels;
      try {
        pixels = ctx.getImageData(0, 0, size, size).data;
      } catch (e) {
        console.error("[OneShotAdaptiveColors] Canvas read blocked:", e);
        BdApi.UI.showToast(
          "Image loaded but color-reading was blocked. This shouldn't happen with the data-URL method — please report this.",
          { type: "error" }
        );
        return;
      }

      const palette = this.extractPalette(pixels);
      this.applyPalette(palette);
    };
    img.onerror = (err) => {
      console.error("[OneShotAdaptiveColors] Image element failed to load:", src.slice(0, 100), err);
      BdApi.UI.showToast(
        "Couldn't load that image — check the console (Ctrl+Shift+I) for details.",
        { type: "error" }
      );
    };
    img.src = src;
  }

  // ------------------------------------------------------------------
  // COLOR EXTRACTION — k-means clustering into 6 groups, then each
  // cluster gets assigned a role (deep/mid/accent/highlight/text) based
  // on its lightness and saturation, instead of just reusing one
  // dominant color everywhere.
  // ------------------------------------------------------------------
  toHsl([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return { h, s, l };
  }

  hslToRgb(h, s, l) {
    if (s === 0) {
      const v = Math.round(l * 255);
      return [v, v, v];
    }
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [
      Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
      Math.round(hue2rgb(p, q, h) * 255),
      Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
    ];
  }

  // Forces a cluster's lightness within [minL, maxL] regardless of what the
  // source image actually contained — this is the contrast safety net.
  // Without it, a mostly-light image can produce "dark panel" and "light
  // text" colors that end up too close together to read.
  clampLightness({ h, s, l }, minL, maxL) {
    const clamped = Math.min(maxL, Math.max(minL, l));
    return this.hslToRgb(h, Math.max(s, 0.25), clamped);
  }

  kmeans(pixels, k, iterations = 8) {
    if (pixels.length === 0) return [];
    let centers = [];
    for (let i = 0; i < k; i++) {
      centers.push(pixels[Math.floor((i / k) * pixels.length)].slice());
    }
    for (let iter = 0; iter < iterations; iter++) {
      const clusters = Array.from({ length: k }, () => []);
      for (const p of pixels) {
        let bestIdx = 0, bestDist = Infinity;
        for (let ci = 0; ci < centers.length; ci++) {
          const c = centers[ci];
          const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
          if (d < bestDist) { bestDist = d; bestIdx = ci; }
        }
        clusters[bestIdx].push(p);
      }
      centers = clusters.map((cluster, ci) => {
        if (cluster.length === 0) return centers[ci];
        const sum = [0, 0, 0];
        for (const p of cluster) { sum[0] += p[0]; sum[1] += p[1]; sum[2] += p[2]; }
        return [sum[0] / cluster.length, sum[1] / cluster.length, sum[2] / cluster.length];
      });
    }
    return centers;
  }

  extractPalette(data) {
    const pixels = [];
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 128) continue; // skip transparent pixels
      pixels.push([data[i], data[i + 1], data[i + 2]]);
    }
    if (pixels.length === 0) {
      // Fully transparent image — bail out with the theme's own defaults
      return {
        deep: "#241536", mid: "#4a2350", magenta: "#4a2350",
        magentaBright: "#8c2f5c", blush: "#e8788f",
        cream: "#f5e6d3", creamDim: "#e8c9b0",
        gold: "#f4c542", goldBright: "#ffd966",
      };
    }

    const clusters = this.kmeans(pixels, 6);
    const withHsl = clusters.map((rgb) => ({ rgb, ...this.toHsl(rgb) }));
    const byLightness = [...withHsl].sort((a, b) => a.l - b.l);
    const bySaturation = [...withHsl].sort((a, b) => b.s - a.s);

    const toHex = ([r, g, b]) =>
      "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");

    // Roles by position on the lightness scale:
    const deep = byLightness[0];
    const mid = byLightness[1];
    const light = byLightness[byLightness.length - 1];
    const midLight = byLightness[byLightness.length - 2];

    // Most vivid cluster (excluding extremes so it stays legible as an accent)
    const accent =
      bySaturation.find((c) => c.l > 0.25 && c.l < 0.8) || bySaturation[0];
    // Second-most vivid, for a secondary highlight color
    const accent2 =
      bySaturation.filter((c) => c !== accent).find((c) => c.l > 0.3 && c.l < 0.85) ||
      midLight;

    // Contrast safety net: no matter how bright or dark the source image is,
    // panel colors stay dark enough and text colors stay light enough that
    // they never collapse into each other.
    return {
      deep: toHex(this.clampLightness(deep, 0.08, 0.22)),
      mid: toHex(this.clampLightness(mid, 0.16, 0.38)),
      magenta: toHex(this.clampLightness(mid, 0.16, 0.38)),
      magentaBright: toHex(this.clampLightness(accent, 0.35, 0.62)),
      blush: toHex(this.clampLightness(accent2, 0.45, 0.72)),
      cream: toHex(this.clampLightness(light, 0.88, 0.97)),
      creamDim: toHex(this.clampLightness(midLight, 0.7, 0.86)),
      gold: toHex(this.clampLightness(accent, 0.4, 0.65)),
      goldBright: toHex(this.clampLightness(accent2, 0.55, 0.78)),
    };
  }

  // ------------------------------------------------------------------
  // APPLY — overrides the theme's CSS variables at runtime.
  // Covers every --os-* color the theme references, plus the two glass
  // tint variables (--glass-frosty, --glass-mid) so the text box and
  // toolbar pick up the extracted mid-tone too, not just accent colors.
  // ------------------------------------------------------------------
  hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  applyPalette({ deep, mid, magenta, magentaBright, blush, cream, creamDim, gold, goldBright }) {
    if (!this.styleEl) {
      this.styleEl = document.createElement("style");
      this.styleEl.id = "oneshot-adaptive-colors";
      document.head.appendChild(this.styleEl);
    }

    this.styleEl.textContent = `
      :root {
        --os-purple-deep: ${deep} !important;
        --os-purple-mid: ${mid} !important;
        --os-magenta: ${magenta} !important;
        --os-magenta-bright: ${magentaBright} !important;
        --os-blush: ${blush} !important;
        --os-cream: ${cream} !important;
        --os-cream-dim: ${creamDim} !important;
        --os-gold: ${gold} !important;
        --os-gold-bright: ${goldBright} !important;

        --glass-frosty: ${this.hexToRgba(mid, 0.28)} !important;
        --glass-mid: ${this.hexToRgba(mid, 0.35)} !important;
        --glass-strong: ${this.hexToRgba(deep, 0.6)} !important;
        --glass-light: ${this.hexToRgba(mid, 0.18)} !important;
        --glass-vivid: ${this.hexToRgba(deep, 0.1)} !important;
        --glass-embed: ${this.hexToRgba(deep, 0.55)} !important;
      }
    `;

    this.settings.active = true;
    this.saveSettings();
    BdApi.UI.showToast("Palette updated from your image!", { type: "success" });
  }
};

// Preview-only: one JS + one CSS chunk, so the demo can be inlined into a single HTML page.
const base = require("./craco.config.js");
const prev = base.webpack && base.webpack.configure;
module.exports = {
  ...base,
  webpack: {
    ...(base.webpack || {}),
    configure: (cfg, ctx) => {
      if (typeof prev === "function") cfg = prev(cfg, ctx) || cfg;
      cfg.optimization = { ...(cfg.optimization || {}), splitChunks: false, runtimeChunk: false };
      cfg.output = { ...cfg.output, filename: "static/js/app.js", chunkFilename: "static/js/app.[id].js" };
      cfg.plugins = [...(cfg.plugins || []), new (require("webpack").optimize.LimitChunkCountPlugin)({ maxChunks: 1 })];
      cfg.plugins = (cfg.plugins || []).map((p) => {
        if (p && p.constructor && p.constructor.name === "MiniCssExtractPlugin") {
          p.options.filename = "static/css/app.css"; p.options.chunkFilename = "static/css/app.[id].css";
        }
        return p;
      });
      return cfg;
    },
  },
};

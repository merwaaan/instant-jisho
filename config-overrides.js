const paths = require('react-scripts/config/paths');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const ManifestPlugin = require('webpack-manifest-plugin');

module.exports = {
  webpack: function override(config, env) {
    // Replace single entry point in the config with multiple ones
    // Note: you may remove any property below except "popup" to exclude respective entry point from compilation
    config.entry = {
      popup: paths.appIndexJs,
      options: paths.appSrc + '/options',
      background: paths.appSrc + '/background',
      content: paths.appSrc + '/content'
    };

    // Change output filename template to get rid of hash
    config.output.filename = '[name].js';

    // Disable built-in SplitChunksPlugin
    config.optimization.splitChunks = {
      cacheGroups: { default: false }
    };

    // Disable runtime chunk addition for each entry point
    config.optimization.runtimeChunk = false;

    // Shared minify options to be used in HtmlWebpackPlugin constructor
    const minifyOpts = {
      removeComments: true,
      collapseWhitespace: true,
      removeRedundantAttributes: true,
      useShortDoctype: true,
      removeEmptyAttributes: true,
      removeStyleLinkTypeAttributes: true,
      keepClosingSlash: true,
      minifyJS: true,
      minifyURLs: true
    };

    // Custom HtmlWebpackPlugin instance for index (popup) page
    const indexHtmlPlugin = new HtmlWebpackPlugin({
      inject: true,
      chunks: ['popup'],
      template: paths.appHtml,
      filename: 'popup.html',
      minify: env === 'production' && minifyOpts
    });

    // Replace original HtmlWebpackPlugin instance in config.plugins with the above one
    config.plugins = replacePlugin(
      config.plugins,
      (name) => /HtmlWebpackPlugin/i.test(name),
      indexHtmlPlugin
    );

    // Custom HtmlWebpackPlugin instance for the options page
    const optionsHtmlPlugin = new HtmlWebpackPlugin({
      inject: true,
      chunks: ['options'],
      template: paths.appPublic + '/options.html',
      filename: 'options.html',
      minify: env === 'production' && minifyOpts
    });

    config.plugins.push(optionsHtmlPlugin);

    // Custom ManifestPlugin instance to cast asset-manifest.json back to old plain format
    const manifestPlugin = new ManifestPlugin({
      fileName: 'asset-manifest.json'
    });
    // Replace original ManifestPlugin instance in config.plugins with the above one
    config.plugins = replacePlugin(
      config.plugins,
      (name) => /ManifestPlugin/i.test(name),
      manifestPlugin
    );

    // Remove GenerateSW plugin from config.plugins to disable service worker generation
    config.plugins = replacePlugin(config.plugins, (name) => /GenerateSW/i.test(name));

    return config;
  }
};

// Utility function to replace/remove specific plugin in a webpack config
function replacePlugin(plugins, nameMatcher, newPlugin) {
  const i = plugins.findIndex((plugin) => {
    return plugin.constructor && plugin.constructor.name && nameMatcher(plugin.constructor.name);
  });
  return i > -1
    ? plugins
        .slice(0, i)
        .concat(newPlugin || [])
        .concat(plugins.slice(i + 1))
    : plugins;
}

const path = require('path');

module.exports = {
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@components': path.resolve(__dirname, 'src/components'),
      '@services': path.resolve(__dirname, 'src/services'),
      '@utils': path.resolve(__dirname, 'src/utils'),
      '@hooks': path.resolve(__dirname, 'src/hooks'),
      '@types': path.resolve(__dirname, 'src/types'),
      '@constants': path.resolve(__dirname, 'src/constants'),
      '@contexts': path.resolve(__dirname, 'src/contexts'),
      '@pages': path.resolve(__dirname, 'src/pages')
    },
    configure: (webpackConfig) => {
      // Add fallbacks for Node.js core modules
      webpackConfig.resolve.fallback = {
        ...webpackConfig.resolve.fallback,
        "crypto": require.resolve("crypto-browserify"),
        "stream": require.resolve("stream-browserify"),
        "util": require.resolve("util/"),
        "buffer": require.resolve("buffer/"),
        "process": require.resolve("process/browser"),
        "path": require.resolve("path-browserify"),
        "url": require.resolve("url/"),
        "fs": false,
        "os": false,
        "child_process": false,
        "net": false,
        "tls": false,
        "dns": false,
      };
      return webpackConfig;
    }
  }
};

const path = require('path');

module.exports = {
  target: 'node', // required for VS Code extensions
  mode: 'production',
  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
  devtool: 'source-map',
  externals: {
    vscode: 'commonjs vscode'
  },
  resolve: {
    extensions: ['.ts', '.js'],
    fallback: {
      fs: false,
      net: false,
      tls: false,
      dns: false,
      crypto: false,
      'cpu-features': false,
      './crypto/build/Release/sshcrypto.node': false  // Added fallback to suppress warning
    }
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: 'ts-loader'
      }
    ]
  }
};

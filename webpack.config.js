const path = require('path');

module.exports = {
  mode: 'development',
  entry: './src/index.js',
  //target: 'node',
  output: {
    libraryTarget: 'commonjs',
    path: path.resolve(__dirname, "dist"),
    filename: 'main.js',
  },
  module: {
    rules: [
      {
        test: /\.m?js$/,
        //exclude: /(node_modules|bower_components)/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
          }
        }
      }
    ]
  },
};

import { merge } from 'webpack-merge';
import common from './webpack.common.js';
import TerserPlugin from 'terser-webpack-plugin';
export default merge(common, {
  mode: 'production',
  entry: {
    VideoEditor: './src/VideoEditor/VideoEditor.js',
  },
  output: {
    library: {
      name: 'VideoEditor',
      type: 'window',
      export: 'default',
    },
    publicPath: 'auto',
    clean: true,
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          format: {
            comments: false,
          },
        },
        extractComments: false,
      }),
    ],
  },
});

// *****************************************************************************
// Copyright (C) 2026 ANKR Labs and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/**
 * Webpack configuration for AI packages optimization
 */

const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
    /**
     * AI-specific optimization settings
     */
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    compress: {
                        // Drop console.debug in production
                        pure_funcs: ['console.debug'],
                        // Remove dead code
                        dead_code: true,
                        // Collapse single-use variables
                        collapse_vars: true,
                        // Reduce variable names
                        reduce_vars: true,
                    },
                    mangle: {
                        // Keep class names for dependency injection
                        keep_classnames: true,
                        // Keep function names for debugging
                        keep_fnames: false,
                    },
                    output: {
                        // Remove comments
                        comments: false,
                    },
                },
                extractComments: false,
            }),
        ],
        // Split AI packages into separate chunks
        splitChunks: {
            cacheGroups: {
                // AI Memory package
                aiMemory: {
                    test: /[\\/]packages[\\/]ai-memory[\\/]/,
                    name: 'ai-memory',
                    chunks: 'all',
                    priority: 20,
                },
                // AI Code Intelligence package
                aiCodeIntelligence: {
                    test: /[\\/]packages[\\/]ai-code-intelligence[\\/]/,
                    name: 'ai-code-intelligence',
                    chunks: 'all',
                    priority: 20,
                },
                // Common AI utilities
                aiCommon: {
                    test: /[\\/]packages[\\/]ai-.*[\\/]src[\\/]common[\\/]/,
                    name: 'ai-common',
                    chunks: 'all',
                    priority: 10,
                },
            },
        },
    },

    /**
     * Module rules for AI packages
     */
    module: {
        rules: [
            {
                test: /\.ts$/,
                include: [
                    /packages[\\/]ai-memory/,
                    /packages[\\/]ai-code-intelligence/,
                ],
                use: [
                    {
                        loader: 'ts-loader',
                        options: {
                            transpileOnly: true,
                            experimentalWatchApi: true,
                        },
                    },
                ],
            },
        ],
    },

    /**
     * Resolve configuration
     */
    resolve: {
        alias: {
            // Alias for faster resolution
            '@theia/ai-memory': '@theia/ai-memory/lib/browser',
            '@theia/ai-code-intelligence': '@theia/ai-code-intelligence/lib/browser',
        },
    },

    /**
     * Performance hints
     */
    performance: {
        hints: 'warning',
        maxEntrypointSize: 512000,
        maxAssetSize: 512000,
    },

    /**
     * Stats configuration for build output
     */
    stats: {
        assets: true,
        chunks: true,
        modules: false,
        reasons: false,
        children: false,
        source: false,
        publicPath: false,
    },
};

/**
 * Development-specific overrides
 */
module.exports.development = {
    optimization: {
        minimize: false,
        splitChunks: {
            cacheGroups: {
                aiMemory: {
                    test: /[\\/]packages[\\/]ai-memory[\\/]/,
                    name: 'ai-memory',
                    chunks: 'all',
                },
                aiCodeIntelligence: {
                    test: /[\\/]packages[\\/]ai-code-intelligence[\\/]/,
                    name: 'ai-code-intelligence',
                    chunks: 'all',
                },
            },
        },
    },
    devtool: 'source-map',
};

/**
 * Production-specific overrides
 */
module.exports.production = {
    devtool: false,
    optimization: {
        ...module.exports.optimization,
        usedExports: true,
        sideEffects: true,
    },
};

/**
 * Helper to merge AI webpack config with main config
 */
module.exports.mergeConfig = function(mainConfig, mode = 'production') {
    const aiConfig = mode === 'development'
        ? { ...module.exports, ...module.exports.development }
        : { ...module.exports, ...module.exports.production };

    return {
        ...mainConfig,
        optimization: {
            ...mainConfig.optimization,
            ...aiConfig.optimization,
            splitChunks: {
                ...mainConfig.optimization?.splitChunks,
                cacheGroups: {
                    ...mainConfig.optimization?.splitChunks?.cacheGroups,
                    ...aiConfig.optimization.splitChunks?.cacheGroups,
                },
            },
        },
        module: {
            ...mainConfig.module,
            rules: [
                ...(mainConfig.module?.rules || []),
                ...aiConfig.module.rules,
            ],
        },
        resolve: {
            ...mainConfig.resolve,
            alias: {
                ...mainConfig.resolve?.alias,
                ...aiConfig.resolve.alias,
            },
        },
        performance: aiConfig.performance,
    };
};

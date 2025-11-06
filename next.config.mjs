import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
    output: 'standalone',
    experimental: {
        serverActions: {
            bodySizeLimit: '10mb'
        },
    },
    serverExternalPackages: ['@zilliz/milvus2-sdk-node'],
    images: {
        qualities: [25, 50, 75],
    },
    turbopack: {
        root: process.cwd(), // 指向 deeptrans-studio
    },
};

export default withNextIntl(nextConfig);
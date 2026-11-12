/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverComponentsExternalPackages: ['mysql2', 'redis', 'bcryptjs'] },
};
export default nextConfig;

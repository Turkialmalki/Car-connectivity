import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The mobile app and this app are separate packages in one repository, so the
  // bundler has to be told which lockfile is ours; otherwise it walks up and
  // infers the home directory as the workspace root.
  turbopack: { root: path.join(__dirname) },
};

export default nextConfig;

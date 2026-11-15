import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Lets a phone on the same Wi-Fi open the dev server at http://<this computer's IP>:<port>.
  // Update the address if your computer's IP changes (System Settings → Wi-Fi → Details).
  allowedDevOrigins: ['192.168.1.190'],
};

export default nextConfig;

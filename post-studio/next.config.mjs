/** @type {import('next').NextConfig} */
const nextConfig = {
  // Settings moved to /onboarding; keep old links and bookmarks working.
  async redirects() {
    return [
      { source: "/settings", destination: "/onboarding", permanent: false },
      { source: "/profile", destination: "/plan", permanent: false },
    ];
  },
};
export default nextConfig;

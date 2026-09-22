/** @type {import('next').NextConfig} */
// This app is served at www.crimetimesnacks.com through rewrites in the static site's
// vercel.json, so its own bundles must not sit at /_next where they would collide with
// paths the static zone owns. assetPrefix moves them under /_community, which the static
// zone rewrites here too.
const nextConfig = {
  assetPrefix: "/_community",
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;

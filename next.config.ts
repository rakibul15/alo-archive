import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Automatic memoization for every component except the ones the
  // `react-hooks/incompatible-library` lint rule flags (currently
  // `DocumentsTable` and `UploadQueuePanel`, both consumers of
  // `useVirtualizer` — see the disable comments at each call site).
  //
  // Moved out of `experimental` in this Next version (16.3.4) — the build's
  // own warning is what caught this; `experimental.reactCompiler` is no
  // longer a recognised key.
  reactCompiler: true,
};

export default nextConfig;

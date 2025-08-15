export default function NotFound() {
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-2xl font-semibold text-white">Page not found</h1>
      <p className="text-white/60">The page you are looking for does not exist.</p>
      <a href="/explore" className="rounded bg-white/10 px-3 py-1.5 text-white hover:bg-white/20">Go to Explore</a>
    </div>
  )
} 
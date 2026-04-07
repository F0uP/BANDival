export default function AppAreaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-area-bg">
      <div className="app-area-blob app-area-blob-a" />
      <div className="app-area-blob app-area-blob-b" />
      <div className="app-area-grid" />
      <div className="app-area-inner">{children}</div>
    </div>
  );
}

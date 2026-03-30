export default function Loading() {
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      minHeight: "calc(100vh - 64px)",
      paddingTop: "64px",
      gap: "16px",
    }}>
      <div style={{
        width: "40px", height: "40px", borderRadius: "50%",
        border: "3px solid #e5e5e5",
        borderTopColor: "#22C55E",
        animation: "spin 0.8s linear infinite",
      }} />
      <p style={{ fontSize: "14px", color: "#888", fontWeight: 500 }}>
        불러오는 중...
      </p>
      <style>{"@keyframes spin { to { transform: rotate(360deg); } }"}</style>
    </div>
  );
}

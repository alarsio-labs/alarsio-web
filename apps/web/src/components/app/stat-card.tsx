// One number on a working screen. With `alertAbove0`, a value above 0 turns red-deep
// and gets the red mark: "to approve" and "low stock" ask for action, 0 does not.
export function StatCard({ label, value, alertAbove0 = false }: { label: string; value: number; alertAbove0?: boolean }) {
  const alert = alertAbove0 && value > 0;
  return (
    <div className={`ax-stat${alert ? " ax-stat-alert" : ""}`}>
      <p className="ax-stat-label">{label}</p>
      <p className="ax-stat-value">{value.toLocaleString("en-IN")}</p>
    </div>
  );
}

export default function InfoCard({ title, children }) {
  return (
    <section className="info-card">
      <span className="eyebrow">{title}</span>
      {children}
    </section>
  )
}
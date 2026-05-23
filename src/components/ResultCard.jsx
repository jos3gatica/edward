import { bytesToSize } from './utils.js'

export default function ResultCard({ item, onSave }) {
  return (
    <article className="result-card">
      <img src={item.dataUrl} alt={item.label} loading="lazy" />
      <div className="result-body">
        <div>
          <h3>{item.label}</h3>
          <p>{item.source}</p>
          <p>{bytesToSize(item.size)}</p>
        </div>
        <button className="secondary-btn" type="button" onClick={() => onSave(item)}>
          Guardar archivo
        </button>
      </div>
    </article>
  )
}
export default function Header({ theme, sourceName, onThemeToggle, onFileChange }) {
  return (
    <aside className="sidebar">
      <div className="brand-block">
        <div className="brand-mark" aria-hidden="true">
          <img
            src="https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/2c0c2b2a-9a9d-4f44-8e3d-73b5eb02d274/d5kcb27-9b5079b4-2d99-44d2-9c75-334c0945c2dc.png/v1/fill/w_400,h_623/20121106_edward_scissorhands_by_amoykid_d5kcb27-fullview.png?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7InBhdGgiOiIvZi8yYzBjMmIyYS05YTlkLTRmNDQtOGUzZC03M2I1ZWIwMmQyNzQvZDVrY2IyNy05YjUwNzliNC0yZDk5LTQ0ZDItOWM3NS0zMzRjMDk0NWMyZGMucG5nIiwiaGVpZ2h0IjoiPD02MjMiLCJ3aWR0aCI6Ijw9NDAwIn1dXSwiYXVkIjpbInVybjpzZXJ2aWNlOmltYWdlLndhdGVybWFyayJdLCJ3bWsiOnsicGF0aCI6Ii93bS8yYzBjMmIyYS05YTlkLTRmNDQtOGUzZC03M2I1ZWIwMmQyNzQvYW1veWtpZC00LnBuZyIsIm9wYWNpdHkiOjk1LCJwcm9wb3J0aW9ucyI6MC40NSwiZ3Jhdml0eSI6ImNlbnRlciJ9fQ.WuSJ_cw8dEWQGW10RohbK34WoIpCKXync5mBrpjH91Y"
            alt="Edward Scissorhands"
            className="brand-face"
          />
        </div>
        <div>
          <h1>EDWARD</h1>
          <p>¿Achivo de imágenes con varias imágenes? EDWARD las cortará por tí.</p>
        </div>
      </div>

      <label className="upload-card">
        <span className="eyebrow">Entrada</span>
        <input
          className="file-input"
          type="file"
          accept="image/*,.pdf,.docx,.pptx,.xlsx"
          onChange={onFileChange}
        />
        <span className="file-trigger">Seleccionar archivo</span>
        <span className="file-name">{sourceName || 'PDF, DOCX, PPTX, XLSX o imagen'}</span>
      </label>

      <button
        type="button"
        className="theme-toggle"
        onClick={onThemeToggle}
        aria-label="Cambiar tema"
      >
        {theme === 'light' ? 'Modo oscuro' : 'Modo claro'}
      </button>
    </aside>
  )
}
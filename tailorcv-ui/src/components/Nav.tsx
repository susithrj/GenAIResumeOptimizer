type NavProps = {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

export function Nav({ theme, onToggleTheme }: NavProps) {
  return (
    <nav>
      <a href="#" className="logo">
        Tailor<span>CV</span>
      </a>
      <ul className="nav-links">
        <li>
          <a href="#tool">Try it now</a>
        </li>
        <li>
          <a href="#how">How it works</a>
        </li>
        <li>
          <a href="#pricing">Pricing</a>
        </li>
      </ul>
      <div className="nav-actions">
        <button
          type="button"
          className="theme-toggle"
          onClick={onToggleTheme}
          title="Toggle light/dark mode"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? '🌙' : '☀️'}
        </button>
        <span className="btn-outline" style={{ opacity: 0.6, cursor: 'default' }} title="Coming soon">
          Log in
        </span>
        <a href="#tool" className="btn-primary">
          Try free →
        </a>
      </div>
    </nav>
  )
}

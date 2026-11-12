import Hero from './components/Hero'
import HowItWorks from './components/HowItWorks'
import Iterations from './components/Iterations'
import Limits from './components/Limits'
import Measurement from './components/Measurement'
import Models from './components/Models'
import Replay from './components/Replay'

const NAV = [
  { href: '#replay', label: 'Replay' },
  { href: '#how', label: 'How it works' },
  { href: '#eval', label: 'The eval' },
  { href: '#iterations', label: 'Iteration' },
  { href: '#models', label: 'Models' },
]

export default function App() {
  return (
    <>
      <nav className="nav">
        <div className="container nav-inner">
          <a className="nav-brand mono" href="#top">
            log-triage
          </a>
          <div className="nav-links">
            {NAV.map((n) => (
              <a key={n.href} href={n.href}>
                {n.label}
              </a>
            ))}
          </div>
        </div>
      </nav>
      <main id="top">
        <Hero />
        <Replay />
        <HowItWorks />
        <Measurement />
        <Iterations />
        <Models />
        <Limits />
      </main>
      <footer className="footer container">
        <p>
          Built by <a href="https://kylewillett.com">Kyle Willett</a> · TypeScript, the Anthropic SDK, React ·{' '}
          <a href="https://github.com/Fours/log-triage">source and every eval run on GitHub</a>
        </p>
      </footer>
    </>
  )
}

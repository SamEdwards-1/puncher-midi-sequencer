import {
  ArrowRight,
  ArrowUpRight,
  Cable,
  Grid2X2,
  Keyboard,
  Music2,
  SlidersHorizontal,
  Workflow,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { Footer } from "../components/footer"
import { SearchTrigger } from "../components/header"
import { Screenshot } from "../components/screenshot"
import { githubUrl } from "../lib/config"
import { screenshots } from "../lib/screenshots"

export default function Home() {
  return (
    <>
      <main id="main" className="home-main">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="status-dot" /> PUNCHER / DOCUMENTATION
            </p>
            <h1>
              A few notes.
              <br />
              <span>
                Four ways
                <br className="desktop-break" /> to play.
              </span>
            </h1>
            <p className="hero-description">
              Get to know your sequencer. Build a pattern, give each voice its
              own rhythm, and see where the next step takes you.
            </p>
            <div className="hero-actions">
              <Link href="/docs/getting-started" className="primary-button">
                Make your first sequence <ArrowRight size={18} />
              </Link>
              <span className="time-label">START HERE</span>
            </div>
            <SearchTrigger />
          </div>
          <div className="hero-visual">
            <div className="visual-label">
              <span>
                <span className="status-dot" /> THE WORKSPACE
              </span>
              <span>01—64 STEPS</span>
            </div>
            <div className="app-frame">
              <div className="frame-top">
                <span className="flex gap-1.5">
                  <i />
                  <i />
                  <i />
                </span>
                <span>PUNCHER / MIDI STEP SEQUENCER</span>
                <ArrowUpRight size={13} />
              </div>
              <Screenshot
                src="homepage.png"
                hero
                caption="PUNCHER with a 64-step grid, sequencer settings, the step editor, and four voice patterns."
              />
            </div>
            <div className="visual-bottom">
              <span>
                <b>04</b> independent voices
              </span>
              <span>
                <b>01</b> shared sequence
              </span>
              <span className="signal-bars" aria-hidden="true">
                ▂ ▅ ▃ ▇ ▄ ▆ ▂ ▅
              </span>
            </div>
          </div>
        </section>

        <section className="start-section" aria-labelledby="start-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">FROM FIRST NOTE TO FINISHED PATCH</p>
              <h2 id="start-title">Find your starting point.</h2>
            </div>
            <Link href="/docs/the-interface" className="text-link">
              Take a look around <ArrowRight size={16} />
            </Link>
          </div>
          <div className="start-grid">
            {[
              {
                n: "01",
                icon: Cable,
                title: "Get connected",
                text: "Hear the built-in synth or send MIDI to your DAW and hardware.",
                href: "midi",
                label: "Set up your sound",
              },
              {
                n: "02",
                icon: Grid2X2,
                title: "Build a sequence",
                text: "Put notes on the grid. Set the pace, choose a route, and add a jump.",
                href: "steps",
                label: "Work with steps",
              },
              {
                n: "03",
                icon: SlidersHorizontal,
                title: "Shape the performance",
                text: "Draw velocity and controller changes. Let each step move the sound.",
                href: "envelopes",
                label: "Explore envelopes",
              },
            ].map((card) => (
              <Link
                href={`/docs/${card.href}`}
                className="start-card"
                key={card.n}
              >
                <div className="card-top">
                  <card.icon size={22} strokeWidth={1.4} />
                  <span>{card.n}</span>
                </div>
                <h3>{card.title}</h3>
                <p>{card.text}</p>
                <span className="card-link">
                  {card.label}
                  <ArrowRight size={16} />
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="deep-section" aria-labelledby="deep-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">UNDER THE SURFACE</p>
              <h2 id="deep-title">A different kind of sequence.</h2>
            </div>
            <p className="section-aside">
              The steps hold the notes.
              <br />
              What happens next is up to the voices.
            </p>
          </div>
          <div className="feature-grid">
            <article className="feature-card">
              <div className="feature-image pattern-crop">
                <div className="pattern-window">
                  <Image
                    src={screenshots["midiseq.png"]}
                    alt="Four colored voice pattern rows with independent rhythms"
                    loading="lazy"
                    sizes="1088px"
                  />
                </div>
              </div>
              <div className="feature-copy">
                <span className="eyebrow">RHYTHM / NOTE CHOICE</span>
                <h3>One chord. Four perspectives.</h3>
                <p>
                  Each voice reads the current step at its own pace. Turn a
                  chord into a bass line, an arpeggio, and a melody that meet
                  and drift apart.
                </p>
                <Link href="/docs/voices" className="text-link">
                  Understand voices <ArrowRight size={16} />
                </Link>
              </div>
            </article>
            <article className="feature-card">
              <div className="feature-image envelope-crop">
                <Image
                  src={screenshots["control-movement.png"]}
                  alt="A MIDI CC envelope modulating Voice 1's note length"
                  loading="lazy"
                  sizes="(max-width: 767px) 80vw, 550px"
                />
              </div>
              <div className="feature-copy">
                <span className="eyebrow">CONTROL / MOVEMENT</span>
                <h3>Supports full MIDI CC automation.</h3>
                <p>
                  Draw and edit envelopes to modulate the sequencer&apos;s
                  settings. Or you can create arbitrary CC envelopes to send
                  along in your MIDI routing.
                </p>
                <Link href="/docs/modulation" className="text-link">
                  Work with modulation <ArrowRight size={16} />
                </Link>
              </div>
            </article>
          </div>
        </section>

        <section className="reference-strip" aria-label="Useful references">
          <Link href="/docs/export">
            <Music2 size={21} />
            <div>
              <strong>Take it with you</strong>
              <span>Export MIDI, WAV, or MP3</span>
            </div>
            <ArrowUpRight size={18} />
          </Link>
          <Link href="/docs/jumps">
            <Workflow size={21} />
            <div>
              <strong>Change the route</strong>
              <span>Repeats, detours, and chance</span>
            </div>
            <ArrowUpRight size={18} />
          </Link>
          <Link href="/docs/shortcuts">
            <Keyboard size={21} />
            <div>
              <strong>Keep your hands moving</strong>
              <span>The keyboard reference</span>
            </div>
            <ArrowUpRight size={18} />
          </Link>
        </section>
        <section className="help-section">
          <div>
            <p className="eyebrow">WHEN SOMETHING DOESN'T SOUND RIGHT</p>
            <h2>Let's get you playing.</h2>
            <p>
              Check the signal path, find a missing setting, or report a
              problem.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/docs/troubleshooting" className="secondary-button">
              Troubleshooting <ArrowRight size={16} />
            </Link>
            <a href={`${githubUrl}/issues`} className="text-link">
              GitHub issues <ArrowUpRight size={16} />
            </a>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}

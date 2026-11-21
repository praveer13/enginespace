import { GAMES } from '@es/play'
import { TagLegend, UNVERIFIED_MEANS } from '@/design/components/Stamp'
import { TextLink } from '@/design/components/TextLink'
import { WorldCard as FloorCard } from '@/games/engine-floor/Card'
import { WorldCard as LoopCard } from '@/games/loop/Card'
import { WorldCard as PoolCard } from '@/games/pool/Card'
import { WorldCard as TensorCard } from '@/games/shape-shifter/Card'
import './panels.css'

/** The licence file that the build writes at the site's root (scripts/pages/third-party-licenses.ts), under the base the site is served at. */
const LICENCES = `${import.meta.env.BASE_URL ?? '/'}third-party-licenses.txt`
/** The folder of the typefaces' licence texts (public/fonts/), under the same base: the text names the folder where the site serves it. */
const FONTS = `${import.meta.env.BASE_URL ?? '/'}fonts/`

/*
 * `/about` (REDESIGN 2.3): what the course is, what each model in it leaves out (each model's card in full), how numbers are tagged, what
 * happens to the learner's data, and the licences. "How numbers are tagged" sits under the anchor `#numbers`, which the footer links to and
 * every stamp's legend repeats: the same four lines, from the stamp's own component, so the page and the stamp never say different things.
 * Its lead is its meta description's sentence (scripts/pages/plan.ts), and a test holds the two together.
 */
const LEAD = 'What the course teaches, what each model in it leaves out, how numbers are tagged, what stays on your device, and the licences of the code and typefaces it uses.'

/**
 * The six models, in the order the course meets them, each with its game's name and its full card. The cards of the verifier and the
 * benchmark game still speak in the words of their old scenes, so they are not set here until each game's own words are in (they are
 * the games' files, and the page says what is missing and not what was).
 */
const MODELS = [
  { game: 'shape-shifter', card: <TensorCard /> },
  { game: 'loop', card: <LoopCard /> },
  { game: 'pool', card: <PoolCard /> },
  { game: 'engine-floor', card: <FloorCard /> },
  { game: 'verifier', card: null },
  { game: 'broken-bench', card: null },
] as const

export function Component() {
  return (
    <div className="es-page" data-page="about">
      <header className="es-page__header">
        <h1 className="es-page__title">About</h1>
        <p className="es-page__lead">{LEAD}</p>
      </header>
      <div className="es-page__body es-about">
        <section aria-labelledby="ab-course" className="es-panel">
          <h2 id="ab-course" className="es-panel__title">
            What the course is
          </h2>
          <p className="es-panel__lead">
            enginespace goes one layer below serving, into the engine. You play the engine&apos;s decisions yourself, as the scheduler, the KV allocator and the verifier, in a seeded
            world where each game&apos;s rule is the concept being taught. Then you check the same skill on the real vLLM and SGLang, on a GPU.
          </p>
          <p className="es-panel__lead">Credit comes from checks you cannot fake: fresh seeds in the browser, comparisons against a reference on the GPU, and traces whose numbers must agree with each other. Clicks earn nothing.</p>
        </section>

        <section aria-labelledby="ab-models" className="es-panel" id="models">
          <h2 id="ab-models" className="es-panel__title">
            What each model leaves out
          </h2>
          <p className="es-panel__lead">
            Each game is a small model of one part of the engine. Its card says what the model keeps, what it leaves out and what it was checked against. The real engine is always the
            judge.
          </p>
          <div className="es-about__cards">
            {MODELS.map(({ game, card }) => (
              <article key={game} className="es-about__card" aria-labelledby={`ab-card-${game}`}>
                <h3 id={`ab-card-${game}`}>{GAMES.get(game)?.title ?? game}</h3>
                {card ?? <p>Not published yet.</p>}
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="numbers-title" className="es-panel" id="numbers">
          <h2 id="numbers-title" className="es-panel__title">
            How numbers are tagged
          </h2>
          <p className="es-panel__lead">
            A number that comes from outside carries a word that says where. Each word is a button that opens these same lines. A count of your own events carries no word, because it
            counts what this browser holds and measures nothing.
          </p>
          <TagLegend />
          <p className="es-panel__lead" data-word="unverified">
            <strong>Unverified:</strong> {UNVERIFIED_MEANS} It is drawn in the alert colour.
          </p>
        </section>

        <section aria-labelledby="ab-privacy" className="es-panel">
          <h2 id="ab-privacy" className="es-panel__title">
            What stays on your device
          </h2>
          <p className="es-panel__lead">
            There is no account and no server. What you do is kept in this browser and nowhere else, the site asks no other site for anything, and nothing is collected. Clearing this
            site&apos;s data erases it, so <TextLink to="/evidence">keep a copy</TextLink> of your progress.
          </p>
        </section>

        <section aria-labelledby="ab-licences" className="es-panel">
          <h2 id="ab-licences" className="es-panel__title">
            Licences
          </h2>
          <p className="es-panel__lead">
            The licences of the third-party code in this site are in <TextLink file={LICENCES}>third-party-licenses.txt</TextLink>; the typefaces are under the SIL Open Font License
            1.1, and the text of each is a file in <code>{FONTS}</code>.
          </p>
        </section>
      </div>
    </div>
  )
}

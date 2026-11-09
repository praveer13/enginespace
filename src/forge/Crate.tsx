import { useRef, useState } from 'react'
import { Button } from '@/design/components/Button'
import { Readout } from '@/design/components/Readout'
import { TapeLabel } from '@/design/components/TapeLabel'
import { TextLink } from '@/design/components/TextLink'
import { Ticket } from '@/design/components/Ticket'
import { checkLine, kitName, kitUrl, type KitState, type LabKit } from './kits'
import type { ForgeLab } from './labs'

/*
 * The lab's crate, handed over (W1b-T08): the zip that the packer made, linked with its size and its SHA-256 on masking tape, and the line that
 * checks a download against that hash. It stands under the module slip while the slip is waiting for a file (`ForgeView`), and not above it,
 * because the slip's chooser belongs in a phone's first screen.
 *
 * The link is there whatever the manifest says, because a zip's name is its lab's id in a fixed frame (kits.ts). The size and the hash come
 * from the manifest, and while it is on its way, or when it cannot be read, the ticket says so and leaves them out.
 */

/** The check line on its own paper, and a plate that copies it. */
function CheckLine({ kit }: { kit: LabKit }) {
  const line = checkLine(kit)
  // The pipe and what it feeds are kept whole when the line wraps (`es-forge-crate__tail`), and it is one line, in one piece of text, when it is copied.
  const pipe = line.lastIndexOf(' | ') + 1
  const code = useRef<HTMLElement>(null)
  const [said, setSaid] = useState('')

  async function copy() {
    try {
      await navigator.clipboard.writeText(line)
      setSaid('Copied.')
    } catch {
      // The clipboard is for a secure page, as crypto.subtle is (https, and localhost), and it can be refused. The line is selected instead,
      // for the learner's own copy.
      const selection = window.getSelection()
      if (code.current === null || selection === null) {
        setSaid('Select the line and copy it.')
        return
      }
      selection.selectAllChildren(code.current)
      setSaid('Selected: press Ctrl+C (Cmd+C on a Mac) to copy it.')
    }
  }

  return (
    <div className="es-forge-crate__check">
      <p>
        To check the download, run this line where you saved the zip. It prints OK when the file is the one the site holds. On a Mac, <code>shasum -a 256 -c</code> reads it in place of <code>sha256sum -c</code>.
      </p>
      <pre className="es-forge-cmd es-forge-crate__line">
        <code ref={code} data-check-line="">
          {pipe === 0 ? line : line.slice(0, pipe)}
          {pipe === 0 ? null : <span className="es-forge-crate__tail">{line.slice(pipe)}</span>}
        </code>
      </pre>
      <div className="es-forge-again">
        <Button variant="plate" size="sm" onClick={() => void copy()}>
          Copy the line
        </Button>
        <span className="es-forge-hint" role="status">
          {said}
        </span>
      </div>
    </div>
  )
}

export function Crate({ lab, kit }: { lab: ForgeLab; kit: KitState }) {
  const name = kit.status === 'ready' ? kit.kit.name : kitName(lab.id)
  return (
    <Ticket as="section" aria-label="The lab's crate" width="wide" hole={false} head="Lab crate" meta={lab.id} title="Take the crate" titleAs="p" className="es-forge-crate">
      <p className="es-forge-crate__file">
        <TextLink file={kitUrl(name)}>{name}</TextLink>
        {kit.status === 'ready' ? <Readout value={kit.kit.bytes} unit="B" tag="measured" size="sm" /> : null}
      </p>
      <p>
        A Cargo workspace: the file you edit, the checks that <code>cargo test</code> runs, and a README.
      </p>
      {kit.status === 'ready' ? (
        <>
          <div className="es-forge-hash">
            <TapeLabel size="sm" tilt="left">
              sha-256
            </TapeLabel>
            <code className="es-forge-crate__digits">{kit.kit.sha256}</code>
          </div>
          <CheckLine kit={kit.kit} />
        </>
      ) : (
        <p className="es-forge-hint">
          {kit.status === 'loading'
            ? "Reading the crate's size and SHA-256 from the site."
            : "The crate's size and SHA-256 could not be read from labs/manifest.json, so they are not printed here. The link still works."}
        </p>
      )}
    </Ticket>
  )
}

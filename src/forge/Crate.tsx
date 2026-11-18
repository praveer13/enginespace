import { useRef, useState } from 'react'
import { Button } from '@/design/components/Button'
import { Readout } from '@/design/components/Readout'
import { TextLink } from '@/design/components/TextLink'
import { checkLine, kitName, kitUrl, type KitState, type LabKit } from './kits'
import type { ForgeLab } from './labs'

/*
 * Step 1 of a lab's page, the crate handed over (W1b-T08): the zip that the packer made, linked with its size and its SHA-256, and the line that
 * checks a download against that hash, kept behind a disclosure so that the step stays short on a phone. The build command of step 3 is the
 * same kind of thing, a line of shell with a button that copies it, so `CopyLine` serves both.
 *
 * The link is there whatever the manifest says, because a zip's name is its lab's id in a fixed frame (kits.ts). The size and the hash come
 * from the manifest, and while it is on its way, or when it cannot be read, the step says so and leaves them out.
 */

/** A line of shell on its own paper, and a button that copies it. `tail` is the part of it that stays whole when the line wraps. */
export function CopyLine({ line, tailFrom, label, mark, className }: { line: string; tailFrom?: number; label: string; mark?: string; className?: string }) {
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

  const split = tailFrom !== undefined && tailFrom > 0
  return (
    <div className={className === undefined ? 'es-forge-copy' : `es-forge-copy ${className}`}>
      <pre className="es-forge-cmd es-forge-crate__line">
        <code ref={code} {...(mark === undefined ? {} : { [mark]: '' })}>
          {split ? line.slice(0, tailFrom) : line}
          {split ? <span className="es-forge-crate__tail">{line.slice(tailFrom)}</span> : null}
        </code>
      </pre>
      <div className="es-forge-again">
        <Button variant="plate" size="sm" onClick={() => void copy()}>
          {label}
        </Button>
        <span className="es-forge-hint" role="status">
          {said}
        </span>
      </div>
    </div>
  )
}

function CheckLine({ kit }: { kit: LabKit }) {
  const line = checkLine(kit)
  // The pipe and what it feeds are kept whole when the line wraps (`es-forge-crate__tail`), and it is one line, in one piece of text, when it is copied.
  const pipe = line.lastIndexOf(' | ') + 1
  return (
    <details className="es-forge-crate__check">
      <summary>Check the download</summary>
      <p>
        Run this line where you saved the zip. It prints OK when the file is the one the site holds. On a Mac, <code>shasum -a 256 -c</code> reads it in place of <code>sha256sum -c</code>.
      </p>
      <CopyLine line={line} tailFrom={pipe} label="Copy the line" mark="data-check-line" />
    </details>
  )
}

export function Crate({ lab, kit }: { lab: ForgeLab; kit: KitState }) {
  const name = kit.status === 'ready' ? kit.kit.name : kitName(lab.id)
  return (
    <div className="es-forge-crate">
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
            <span className="es-forge-hash__name">SHA-256</span>
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
    </div>
  )
}

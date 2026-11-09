import { useEffect, useState } from 'react'
import { SPECIALS } from './copy'
import { loadPoster, posterElement, posterOf, posterRead } from './posters'
import type { PosterNode } from './posters'

type Picture = { state: 'reading' } | { state: 'drawn'; tree: PosterNode } | { state: 'missing' }

/**
 * A game's poster in its well. The well is the shape of the drawing before the file has come, so nothing moves when it does, and if the
 * file does not come it says so in words. The drawing carries its own name for assistive technology (packages/play/loop/layout.ts).
 */
export function Poster({ id }: { id: string }) {
  const poster = posterOf(id)
  const file = poster?.file
  const [picture, setPicture] = useState<Picture>(() => {
    const tree = file === undefined ? null : posterRead(file)
    return tree === null ? { state: 'reading' } : { state: 'drawn', tree }
  })
  useEffect(() => {
    if (file === undefined) return undefined
    let live = true
    void loadPoster(file).then((tree) => {
      if (live) setPicture(tree === null ? { state: 'missing' } : { state: 'drawn', tree })
    })
    return () => {
      live = false
    }
  }, [file])
  if (poster === undefined) return null
  return (
    <div className="es-poster" data-state={picture.state} style={{ aspectRatio: `${poster.width} / ${poster.height}` }}>
      {picture.state === 'drawn' ? posterElement(picture.tree) : null}
      {picture.state === 'missing' ? <span className="es-line__empty">{SPECIALS.poster.none}</span> : null}
    </div>
  )
}
